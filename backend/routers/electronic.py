import hashlib

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Sale, SettingsElectronic, User

# NOTE: backend/routers/settings.py already implements GET/PUT /electronic/settings
# and GET/POST /electronic/certificate (built concurrently by another agent during
# this migration) — this router intentionally only adds the endpoint settings.py is
# missing: simulated CUFE/XML generation for a sale.
electronic_router = APIRouter(prefix="/api", tags=["electronic"])


class _ElectronicSettingsDefaults:
    nit = ""
    razon_social = ""
    resolucion = ""
    prefijo = "FE"


@electronic_router.get("/electronic/invoice/{sale_id}")
async def electronic_invoice(
    sale_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Genera CUFE y XML UBL SIMULADOS para la venta. No válido ante la DIAN real."""
    tenant_id = user.tenant_id or "tenant-default-001"
    sale = await session.get(Sale, sale_id)
    if not sale or sale.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    st = (
        await session.execute(select(SettingsElectronic).where(SettingsElectronic.tenant_id == tenant_id))
    ).scalar_one_or_none() or _ElectronicSettingsDefaults()

    number = f"{st.prefijo or 'FE'}{sale.number or ''}"
    date = sale.created_at.isoformat() if sale.created_at else ""
    total = float(sale.total)
    cufe = hashlib.sha256(f"{number}{date}{total}{st.nit}{st.resolucion}".encode()).hexdigest()

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- SIMULACIÓN - Documento NO válido ante la DIAN -->
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <UBLVersionID>UBL 2.1</UBLVersionID>
  <ID>{number}</ID>
  <IssueDate>{date[:10]}</IssueDate>
  <InvoiceTypeCode>01</InvoiceTypeCode>
  <DocumentCurrencyCode>COP</DocumentCurrencyCode>
  <AccountingSupplierParty>
    <Party><PartyName><Name>{st.razon_social}</Name></PartyName>
    <PartyTaxScheme><CompanyID>{st.nit}</CompanyID></PartyTaxScheme></Party>
  </AccountingSupplierParty>
  <LegalMonetaryTotal>
    <LineExtensionAmount currencyID="COP">{sale.subtotal}</LineExtensionAmount>
    <TaxInclusiveAmount currencyID="COP">{total}</TaxInclusiveAmount>
    <PayableAmount currencyID="COP">{total}</PayableAmount>
  </LegalMonetaryTotal>
  <CUFE>{cufe}</CUFE>
</Invoice>"""

    sale.cufe = cufe
    sale.electronic_number = number
    sale.electronic_status = "simulada"
    await session.commit()

    return {"number": number, "cufe": cufe, "xml": xml, "status": "simulada"}
