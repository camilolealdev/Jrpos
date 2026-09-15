import base64
import hashlib
import json
import os
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from pricing import compute_unit_pricing
from permissions import require_permission
from entitlements import check_feature_enabled
from redis_client import rate_limit
from models_sql import (
    Contact,
    Product,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    SettingsGeneral,
    StockMovement,
    SupportDoc,
    SupportDocItem,
    User,
    utcnow,
)

invoices_router = APIRouter(prefix="/api", tags=["invoices"])


# ----------------- Invoice OCR (Multi-Provider Router con Failover) -----------------
OCR_SYSTEM = (
    "Eres un extractor experto de facturas y recibos de compra comerciales colombianos para un sistema de inventario POS. "
    "Devuelve ÚNICAMENTE un objeto JSON válido, sin explicaciones ni texto introductorio, con este esquema exacto:\n"
    "{\n"
    '  "supplier_name": string (nombre o razón social del proveedor),\n'
    '  "supplier_nit": string (NIT o cédula del proveedor sin puntos ni guiones),\n'
    '  "invoice_number": string (número o consecutivo de factura),\n'
    '  "date": string (formato YYYY-MM-DD),\n'
    '  "subtotal": number (en pesos colombianos sin decimales),\n'
    '  "tax": number (IVA total en pesos colombianos),\n'
    '  "total": number (total en pesos colombianos),\n'
    '  "items": [\n'
    '    {\n'
    '      "name": string (descripción clara del producto),\n'
    '      "quantity": number (cantidad recibida),\n'
    '      "unit_price": number (costo de compra unitario en COP),\n'
    '      "total": number (total de la línea en COP),\n'
    '      "barcode": string (código de barras si es visible, o cadena vacía)\n'
    '    }\n'
    '  ]\n'
    "}\n"
    "Reglas esenciales:\n"
    "1. Preserva los nombres y descripciones de los productos con exactitud sin normalizar.\n"
    "2. Todos los precios deben ser números en pesos colombianos (COP), sin puntos de miles ni símbolos de moneda.\n"
    "3. Si un dato no es legible, usa 0 para números o cadena vacía para textos. Nunca inventes información."
)


def _extract_json(text_: str) -> dict:
    if not text_:
        return {}
    cleaned = re.sub(r"^```(?:json)?", "", text_.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"```$", "", cleaned.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except Exception:
        s = cleaned.find("{")
        e = cleaned.rfind("}")
        if s != -1 and e != -1 and e > s:
            try:
                return json.loads(cleaned[s:e + 1])
            except Exception:
                pass
    return {}


class InvoiceItemOCR(BaseModel):
    name: str
    quantity: float = 1
    unit_price: float = 0.0
    total: float = 0.0
    barcode: Optional[str] = None


class InvoiceOCR(BaseModel):
    supplier_name: Optional[str] = None
    supplier_nit: Optional[str] = None
    invoice_number: Optional[str] = None
    date: Optional[str] = None
    subtotal: Optional[float] = 0.0
    tax: Optional[float] = 0.0
    total: Optional[float] = 0.0
    items: List[InvoiceItemOCR] = []
    provider_used: Optional[str] = None
    fallback_triggered: bool = False
    fallback_chain: List[str] = []


class OCRRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"
    model: str = "gemini-3-flash-preview"  # economic default


class ImportInvoiceRequest(BaseModel):
    supplier_name: Optional[str] = None
    supplier_nit: Optional[str] = None
    invoice_number: Optional[str] = None
    date: Optional[str] = None
    # each: {name, barcode, quantity, unit_price, selling_price, category, tax_rate,
    #        units_per_package, margin_percent}
    # - quantity: cantidad de PAQUETES/CAJAS recibidos si units_per_package > 1; unidades si es 1 (default).
    # - unit_price: costo del paquete/caja completo si units_per_package > 1; costo unitario si es 1.
    # - margin_percent: % de utilidad a aplicar sobre el costo unitario ya dividido -> precio final POS
    #   (se ignora si selling_price viene explícito, que siempre gana).
    items: List[dict]


async def _call_gemini_vision(img_bytes: bytes, mime_type: str, model_name: str, api_key: str) -> str:
    from google import genai
    from google.genai import types

    # Mapeo de nombres si viene preview obsoleto
    actual_model = "gemini-1.5-flash" if model_name in ("gemini-3-flash-preview", "gemini-1.5-flash") else model_name
    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(
        model=actual_model,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(
                        text="Extrae los datos de esta factura de compra colombiana. Devuelve SOLO el JSON con el esquema pedido."
                    ),
                    types.Part.from_bytes(data=img_bytes, mime_type=mime_type),
                ],
            )
        ],
        config=types.GenerateContentConfig(
            system_instruction=OCR_SYSTEM,
            temperature=0.1,
            max_output_tokens=65536,
        ),
    )
    return response.text or ""


async def _call_openai_compatible_vision(
    base_url: str,
    model_name: str,
    api_key: str,
    image_data_uri: str,
    extra_headers: Optional[dict] = None,
) -> str:
    import httpx

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    messages = [
        {"role": "system", "content": OCR_SYSTEM},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Extrae los datos de esta factura de compra colombiana. Devuelve SOLO el JSON solicitado sin explicaciones.",
                },
                {
                    "type": "image_url",
                    "image_url": {"url": image_data_uri},
                },
            ],
        },
    ]

    async with httpx.AsyncClient(timeout=45.0) as http_client:
        res = await http_client.post(
            f"{base_url.rstrip('/')}/chat/completions",
            json={
                "model": model_name,
                "messages": messages,
                "temperature": 0.1,
                "max_tokens": 4096,
            },
            headers=headers,
        )
        if res.status_code != 200:
            raise Exception(f"HTTP {res.status_code}: {res.text[:200]}")
        data = res.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")


@invoices_router.post("/invoices/ocr", response_model=InvoiceOCR)
async def ocr_invoice(
    payload: OCRRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("invoices:ocr")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    # Validar que el plan comercial incluya IA OCR
    await check_feature_enabled(session, tenant_id, "ai_ocr")

    # Cargar configuración activa de IA en Settings filtrada por tenant_id
    settings_stmt = select(SettingsGeneral).where(SettingsGeneral.tenant_id == tenant_id)
    settings_row = (await session.execute(settings_stmt)).scalars().first()
    if not settings_row:
        settings_row = await session.get(SettingsGeneral, 1)

    # Strip data URL prefix if present
    img_b64 = payload.image_base64
    if img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[-1]
    try:
        img_bytes = base64.b64decode(img_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen inválida")

    mime = payload.mime_type or "image/jpeg"
    image_data_uri = f"data:{mime};base64,{img_b64}"

    # Construir lista ordenada de candidatos (Prioridad: Configurado por tenant -> Fallbacks de plataforma)
    candidates = []

    pref_provider = (settings_row.ai_provider if settings_row and settings_row.ai_provider else "gemini").lower()
    own_key = (settings_row.ai_api_key if settings_row and settings_row.ai_api_key else "").strip()
    pref_model = settings_row.ai_model if settings_row and settings_row.ai_model else None
    pref_base_url = (settings_row.ai_base_url if settings_row and settings_row.ai_base_url else "").strip()

    if own_key:
        candidates.append({
            "id": f"tenant_{pref_provider}",
            "display_name": f"Configurado ({pref_provider})",
            "type": "gemini" if pref_provider == "gemini" else "openai",
            "api_key": own_key,
            "base_url": pref_base_url or {
                "openrouter": "https://openrouter.ai/api/v1",
                "nvidia": "https://integrate.api.nvidia.com/v1",
                "groq": "https://api.groq.com/openai/v1",
            }.get(pref_provider, "https://api.openai.com/v1"),
            "model": pref_model or ("gemini-1.5-flash" if pref_provider == "gemini" else "gpt-4o-mini"),
            "extra_headers": {"HTTP-Referer": "https://jrpos.com", "X-Title": "JRPOS Scanner"} if pref_provider == "openrouter" else None,
            "is_platform": False,
        })

    # Candidatos de plataforma (variables de entorno con failover automático)
    platform_pool = [
        {
            "id": "gemini",
            "display_name": "Google Gemini (Flash)",
            "type": "gemini",
            "api_key": os.environ.get("GEMINI_API_KEY", "").strip(),
            "base_url": None,
            "model": os.environ.get("GEMINI_MODEL", "gemini-1.5-flash"),
            "extra_headers": None,
            "is_platform": True,
        },
        {
            "id": "nvidia",
            "display_name": "NVIDIA NIM Vision",
            "type": "openai",
            "api_key": os.environ.get("NVIDIA_API_KEY", "").strip(),
            "base_url": os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"),
            "model": os.environ.get("NVIDIA_MODEL", "meta/llama-3.2-11b-vision-instruct"),
            "extra_headers": None,
            "is_platform": True,
        },
        {
            "id": "openrouter",
            "display_name": "OpenRouter Vision",
            "type": "openai",
            "api_key": os.environ.get("OPENROUTER_API_KEY", "").strip(),
            "base_url": os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
            "model": os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free"),
            "extra_headers": {"HTTP-Referer": "https://jrpos.com", "X-Title": "JRPOS Scanner"},
            "is_platform": True,
        },
        {
            "id": "groq",
            "display_name": "Groq Vision",
            "type": "openai",
            "api_key": os.environ.get("GROQ_API_KEY", "").strip(),
            "base_url": os.environ.get("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            "model": os.environ.get("GROQ_MODEL", "llama-3.2-11b-vision-preview"),
            "extra_headers": None,
            "is_platform": True,
        },
        {
            "id": "tokenrouter",
            "display_name": "TokenRouter",
            "type": "openai",
            "api_key": os.environ.get("TOKENROUTER_API_KEY", "").strip(),
            "base_url": os.environ.get("TOKENROUTER_BASE_URL", "https://api.tokenrouter.io/v1"),
            "model": os.environ.get("TOKENROUTER_MODEL", "gpt-4o-mini"),
            "extra_headers": None,
            "is_platform": True,
        },
        {
            "id": "orcarouter",
            "display_name": "OrcaRouter",
            "type": "openai",
            "api_key": os.environ.get("ORCAROUTER_API_KEY", "").strip(),
            "base_url": os.environ.get("ORCAROUTER_BASE_URL", "https://api.orcarouter.com/v1"),
            "model": os.environ.get("ORCAROUTER_MODEL", "gpt-4o-mini"),
            "extra_headers": None,
            "is_platform": True,
        },
        {
            "id": "custom_ocr",
            "display_name": "Custom OCR Router",
            "type": "openai",
            "api_key": os.environ.get("CUSTOM_OCR_API_KEY", "").strip(),
            "base_url": os.environ.get("CUSTOM_OCR_BASE_URL", "").strip(),
            "model": os.environ.get("CUSTOM_OCR_MODEL", "gpt-4o-mini"),
            "extra_headers": None,
            "is_platform": True,
        },
    ]

    for p in platform_pool:
        # Solo agregar si tiene api_key configurada y no es un duplicado del tenant ya añadido
        if p["api_key"] and (not own_key or p["api_key"] != own_key):
            # Si el tipo es OpenAI, requiere base_url válida
            if p["type"] == "openai" and not p["base_url"]:
                continue
            candidates.append(p)

    if not candidates:
        raise HTTPException(
            status_code=400,
            detail="No hay proveedores de IA ni API Keys configuradas para OCR. Ve a Configuración > IA o agrega las claves en el .env del servidor.",
        )

    # Validar cuota diaria si se utiliza clave de plataforma
    daily_limit = int(os.environ.get("OCR_PLATFORM_DAILY_LIMIT", "50"))

    errors = []
    attempted_providers = []
    successful_candidate = None
    response_text = ""

    for cand in candidates:
        cand_name = cand["display_name"]
        attempted_providers.append(cand_name)

        if cand["is_platform"]:
            allowed = await rate_limit(f"ocr:platform:{tenant_id}", daily_limit, 86400)
            if not allowed:
                errors.append(f"{cand_name}: Límite diario de plataforma ({daily_limit}/día) alcanzado")
                continue

        try:
            if cand["type"] == "gemini":
                response_text = await _call_gemini_vision(img_bytes, mime, cand["model"], cand["api_key"])
            else:
                response_text = await _call_openai_compatible_vision(
                    cand["base_url"], cand["model"], cand["api_key"], image_data_uri, cand.get("extra_headers")
                )

            parsed_candidate = _extract_json(response_text)
            if parsed_candidate and (parsed_candidate.get("items") or parsed_candidate.get("supplier_name")):
                successful_candidate = cand
                break
            else:
                errors.append(f"{cand_name}: No devolvió un JSON con productos válidos")
        except Exception as e:
            errors.append(f"{cand_name}: {str(e)}")
            continue

    if not successful_candidate:
        error_summary = " | ".join(errors)
        raise HTTPException(
            status_code=502,
            detail=f"Todos los proveedores de OCR fallaron. Detalles: {error_summary}",
        )

    parsed = _extract_json(response_text)
    if not parsed:
        raise HTTPException(status_code=422, detail="No se pudo extraer JSON de la factura. Intenta con una foto más nítida.")

    # Sanitizar items extraídos
    items = []
    for it in parsed.get("items", []) or []:
        try:
            items.append(InvoiceItemOCR(
                name=str(it.get("name", "")).strip() or "Producto",
                quantity=float(it.get("quantity", 1) or 1),
                unit_price=float(it.get("unit_price", 0) or 0),
                total=float(it.get("total", 0) or 0),
                barcode=(str(it.get("barcode", "")).strip() or None),
            ))
        except Exception:
            continue

    fallback_triggered = len(attempted_providers) > 1

    return InvoiceOCR(
        supplier_name=parsed.get("supplier_name") or "",
        supplier_nit=parsed.get("supplier_nit") or "",
        invoice_number=parsed.get("invoice_number") or "",
        date=parsed.get("date") or "",
        subtotal=float(parsed.get("subtotal", 0) or 0),
        tax=float(parsed.get("tax", 0) or 0),
        total=float(parsed.get("total", 0) or 0),
        items=items,
        provider_used=successful_candidate["display_name"],
        fallback_triggered=fallback_triggered,
        fallback_chain=attempted_providers,
    )


@invoices_router.post("/invoices/import")
async def import_invoice_to_inventory(
    payload: ImportInvoiceRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Given confirmed invoice items, upsert products (by barcode or name) and increment stock."""
    tenant_id = user.tenant_id or "tenant-default-001"
    imported = 0
    updated = 0
    supplier_id = None
    if payload.supplier_name:
        existing = (
            await session.execute(
                select(Contact).where(
                    Contact.name == payload.supplier_name,
                    Contact.kind == "supplier",
                    Contact.tenant_id == tenant_id,
                )
            )
        ).scalar_one_or_none()
        if not existing:
            supplier = Contact(kind="supplier", name=payload.supplier_name, document=payload.supplier_nit, tenant_id=tenant_id)
            session.add(supplier)
            await session.flush()
            supplier_id = supplier.id
        else:
            supplier_id = existing.id

    for it in payload.items:
        name = (it.get("name") or "").strip()
        barcode = (it.get("barcode") or "").strip() or None
        package_qty = float(it.get("quantity", 0) or 0)
        package_cost = float(it.get("unit_price", 0) or 0)
        units_per_package = float(it.get("units_per_package") or 1) or 1.0
        margin_raw = it.get("margin_percent")
        margin_percent = float(margin_raw) if margin_raw not in (None, "") else None
        selling_price_raw = float(it.get("selling_price", 0) or 0)
        selling_price = selling_price_raw if selling_price_raw > 0 else None
        category = (it.get("category") or "General").strip() or "General"
        tax_rate = float(it.get("tax_rate", 19) or 19)

        if not name:
            continue

        total_units = package_qty * units_per_package
        unit_cost, unit_price = compute_unit_pricing(
            package_cost, units_per_package, margin_percent,
            explicit_price=selling_price,
        )
        # sin selling_price ni margin_percent, conserva el fallback histórico (30% de markup)
        if unit_price is None:
            unit_price = round((unit_cost or 0) * 1.3, 2)

        existing_p = None
        if barcode:
            existing_p = (
                await session.execute(select(Product).where(Product.barcode == barcode, Product.tenant_id == tenant_id))
            ).scalar_one_or_none()
        if not existing_p:
            existing_p = (
                await session.execute(select(Product).where(Product.name == name, Product.tenant_id == tenant_id))
            ).scalar_one_or_none()

        if existing_p:
            previous_stock = float(existing_p.stock)
            existing_p.stock = previous_stock + total_units
            if total_units:
                session.add(StockMovement(
                    tenant_id=tenant_id, product_id=existing_p.id, type="purchase", qty=total_units,
                    previous_stock=previous_stock, new_stock=float(existing_p.stock), user_id=user.id,
                    reason="Escaneo de factura de compra (IA)",
                ))
            existing_p.cost = unit_cost if unit_cost is not None else existing_p.cost
            existing_p.price = unit_price
            existing_p.units_per_package = units_per_package
            if margin_percent is not None:
                existing_p.margin_percent = margin_percent
            existing_p.updated_at = utcnow()
            if supplier_id:
                existing_p.supplier_id = supplier_id
            updated += 1
        else:
            session.add(Product(
                name=name,
                barcode=barcode,
                category=category,
                cost=unit_cost or 0.0,
                price=unit_price,
                stock=total_units,
                tax_rate=tax_rate,
                supplier_id=supplier_id,
                margin_percent=margin_percent,
                units_per_package=units_per_package,
                tenant_id=tenant_id,
            ))
            imported += 1

    # Save invoice record
    inv = PurchaseInvoice(
        supplier_name=payload.supplier_name,
        supplier_nit=payload.supplier_nit,
        invoice_number=payload.invoice_number,
        date=payload.date,
        tenant_id=tenant_id,
    )
    session.add(inv)
    await session.flush()

    for it in payload.items:
        session.add(PurchaseInvoiceItem(
            purchase_invoice_id=inv.id,
            tenant_id=tenant_id,
            name=(it.get("name") or "").strip() or "Producto",
            barcode=(it.get("barcode") or "").strip() or None,
            quantity=float(it.get("quantity", 0) or 0),
            unit_price=float(it.get("unit_price", 0) or 0),
            selling_price=(float(it.get("selling_price", 0) or 0) or None),
            category=(it.get("category") or "General").strip() or "General",
            tax_rate=float(it.get("tax_rate", 19) or 19),
            units_per_package=(float(it.get("units_per_package")) if it.get("units_per_package") not in (None, "") else None),
            margin_percent=(float(it.get("margin_percent")) if it.get("margin_percent") not in (None, "") else None),
        ))

    await session.commit()
    return {"ok": True, "imported": imported, "updated": updated, "invoice_id": inv.id}


# ----------------- Documento Soporte (simulado) -----------------
class SupportDocItemIn(BaseModel):
    name: str
    barcode: Optional[str] = None
    qty: float = 1.0
    cost: Optional[float] = None
    price: Optional[float] = None


class SupportDocItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    barcode: Optional[str] = None
    qty: float
    cost: Optional[float] = None


class SupportDocCreate(BaseModel):
    supplier_name: Optional[str] = None
    supplier_doc: Optional[str] = None
    items: List[SupportDocItemIn] = []


class SupportDocOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    supplier_name: Optional[str] = None
    supplier_doc: Optional[str] = None
    items: List[SupportDocItemOut] = []
    total: float
    status: str
    cude: str
    created_at: datetime


async def _support_doc_out(session: AsyncSession, doc: SupportDoc) -> SupportDocOut:
    items = (
        await session.execute(select(SupportDocItem).where(SupportDocItem.support_doc_id == doc.id))
    ).scalars().all()
    return SupportDocOut(
        id=doc.id, number=doc.number, supplier_name=doc.supplier_name, supplier_doc=doc.supplier_doc,
        items=items, total=doc.total, status=doc.status, cude=doc.cude, created_at=doc.created_at,
    )


@invoices_router.post("/support-docs", response_model=SupportDocOut)
async def create_support_doc(
    payload: SupportDocCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    # original computed total from item "price" (frontend always sends price == cost for this form)
    total = round(
        sum(float(i.qty) * float(i.price if i.price is not None else (i.cost or 0)) for i in payload.items), 2
    )
    seq = (await session.execute(text("SELECT nextval('support_docs_number_seq')"))).scalar_one()
    number = f"DS-{seq:06d}"
    cude = hashlib.sha256(f"DS{number}{total}".encode()).hexdigest()

    doc = SupportDoc(
        number=number, supplier_name=payload.supplier_name, supplier_doc=payload.supplier_doc,
        total=total, status="simulada", cude=cude, tenant_id=tenant_id,
    )
    session.add(doc)
    await session.flush()

    for it in payload.items:
        session.add(SupportDocItem(
            support_doc_id=doc.id, name=it.name, barcode=it.barcode, qty=it.qty,
            cost=it.cost if it.cost is not None else it.price, tenant_id=tenant_id,
        ))

    await session.commit()
    return await _support_doc_out(session, doc)


@invoices_router.get("/support-docs", response_model=List[SupportDocOut])
async def list_support_docs(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = (
        select(SupportDoc)
        .where(SupportDoc.tenant_id == tenant_id)
        .order_by(SupportDoc.created_at.desc())
        .limit(300)
    )
    docs = (await session.execute(stmt)).scalars().all()
    return [await _support_doc_out(session, d) for d in docs]


@invoices_router.get("/invoices/purchase")
async def list_purchase_invoices(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = (
        select(PurchaseInvoice)
        .where(PurchaseInvoice.tenant_id == tenant_id)
        .order_by(PurchaseInvoice.created_at.desc())
        .limit(200)
    )
    invoices = (await session.execute(stmt)).scalars().all()
    result = []
    for inv in invoices:
        items = (await session.execute(
            select(PurchaseInvoiceItem).where(PurchaseInvoiceItem.purchase_invoice_id == inv.id)
        )).scalars().all()
        result.append({
            "id": inv.id,
            "supplier_name": inv.supplier_name,
            "supplier_nit": inv.supplier_nit,
            "invoice_number": inv.invoice_number,
            "date": inv.date,
            "created_at": inv.created_at,
            "items": [
                {
                    "name": it.name, "barcode": it.barcode, "quantity": it.quantity,
                    "unit_price": it.unit_price, "selling_price": it.selling_price,
                    "category": it.category, "tax_rate": it.tax_rate,
                    "units_per_package": it.units_per_package, "margin_percent": it.margin_percent,
                }
                for it in items
            ],
        })
    return result
