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
from models_sql import (
    Contact,
    Product,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    SupportDoc,
    SupportDocItem,
    User,
    utcnow,
)

invoices_router = APIRouter(prefix="/api", tags=["invoices"])


# ----------------- Invoice OCR (Gemini vision) -----------------
# EXACT prompt ported from the original server.py (backend/server.py, grep OCR_SYSTEM) — do not reword.
OCR_SYSTEM = (
    "Eres un extractor experto de facturas colombianas para una tienda de abarrotes. "
    "Devuelve SOLO un JSON válido, sin explicaciones, con este esquema exacto: "
    '{"supplier_name": string, "supplier_nit": string, "invoice_number": string, "date": string(YYYY-MM-DD), '
    '"subtotal": number, "tax": number, "total": number, '
    '"items": [{"name": string, "quantity": number, "unit_price": number, "total": number, "barcode": string}]}. '
    "Los precios deben ser números en pesos colombianos (COP) sin puntos ni comas. Si no logras leer un valor, usa 0 o cadena vacía. Nunca inventes."
)


def _extract_json(text_: str) -> dict:
    # find first { ... last }
    start = text_.find("{")
    end = text_.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text_[start:end + 1])
    except Exception:
        # try to strip code fences
        cleaned = re.sub(r"```(json)?", "", text_).replace("```", "")
        s2 = cleaned.find("{")
        e2 = cleaned.rfind("}")
        try:
            return json.loads(cleaned[s2:e2 + 1])
        except Exception:
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


@invoices_router.post("/invoices/ocr", response_model=InvoiceOCR)
async def ocr_invoice(
    payload: OCRRequest,
    user: User = Depends(get_current_user),
):
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY no configurada")

    # Call shape verified against an actual `pip install google-genai` resolve
    # (google-genai==2.22.0, satisfies requirements.txt's >=0.3.0): Client(api_key=...),
    # client.aio.models.generate_content(model=, contents=, config=), types.Content(role=,
    # parts=), types.Part.from_text(text=)/from_bytes(data=, mime_type=),
    # types.GenerateContentConfig(system_instruction=...), response.text (a verified
    # property on GenerateContentResponse). Still worth a live smoke test with a real
    # GEMINI_API_KEY before shipping, since this was checked via introspection, not a
    # live API call.
    from google import genai
    from google.genai import types

    model = payload.model or "gemini-3-flash-preview"

    # Strip data URL prefix if present
    img_b64 = payload.image_base64
    if img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[-1]
    try:
        img_bytes = base64.b64decode(img_b64)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagen inválida")

    client = genai.Client(api_key=api_key)
    try:
        response = await client.aio.models.generate_content(
            model=model,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=(
                            "Extrae los datos de esta factura de compra. Devuelve SOLO el JSON con el esquema pedido. "
                            "Incluye cada línea de producto en 'items'."
                        )),
                        types.Part.from_bytes(data=img_bytes, mime_type=payload.mime_type),
                    ],
                )
            ],
            config=types.GenerateContentConfig(system_instruction=OCR_SYSTEM),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al procesar imagen: {e}")

    response_text = response.text or ""
    parsed = _extract_json(response_text)
    if not parsed:
        raise HTTPException(status_code=422, detail="No se pudo extraer JSON de la factura. Intenta con foto más clara o edición manual.")

    # sanitize items
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

    return InvoiceOCR(
        supplier_name=parsed.get("supplier_name") or "",
        supplier_nit=parsed.get("supplier_nit") or "",
        invoice_number=parsed.get("invoice_number") or "",
        date=parsed.get("date") or "",
        subtotal=float(parsed.get("subtotal", 0) or 0),
        tax=float(parsed.get("tax", 0) or 0),
        total=float(parsed.get("total", 0) or 0),
        items=items,
    )


@invoices_router.post("/invoices/import")
async def import_invoice_to_inventory(
    payload: ImportInvoiceRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Given confirmed invoice items, upsert products (by barcode or name) and increment stock."""
    imported = 0
    updated = 0
    supplier_id = None
    if payload.supplier_name:
        existing = (
            await session.execute(
                select(Contact).where(Contact.name == payload.supplier_name, Contact.kind == "supplier")
            )
        ).scalar_one_or_none()
        if not existing:
            supplier = Contact(kind="supplier", name=payload.supplier_name, document=payload.supplier_nit)
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
                await session.execute(select(Product).where(Product.barcode == barcode))
            ).scalar_one_or_none()
        if not existing_p:
            existing_p = (
                await session.execute(select(Product).where(Product.name == name))
            ).scalar_one_or_none()

        if existing_p:
            existing_p.stock = float(existing_p.stock) + total_units
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
            ))
            imported += 1

    # Save invoice record
    inv = PurchaseInvoice(
        supplier_name=payload.supplier_name,
        supplier_nit=payload.supplier_nit,
        invoice_number=payload.invoice_number,
        date=payload.date,
    )
    session.add(inv)
    await session.flush()

    for it in payload.items:
        session.add(PurchaseInvoiceItem(
            purchase_invoice_id=inv.id,
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
    # original computed total from item "price" (frontend always sends price == cost for this form)
    total = round(
        sum(float(i.qty) * float(i.price if i.price is not None else (i.cost or 0)) for i in payload.items), 2
    )
    seq = (await session.execute(text("SELECT nextval('support_docs_number_seq')"))).scalar_one()
    number = f"DS-{seq:06d}"
    cude = hashlib.sha256(f"DS{number}{total}".encode()).hexdigest()

    doc = SupportDoc(
        number=number, supplier_name=payload.supplier_name, supplier_doc=payload.supplier_doc,
        total=total, status="simulada", cude=cude,
    )
    session.add(doc)
    await session.flush()

    for it in payload.items:
        session.add(SupportDocItem(
            support_doc_id=doc.id, name=it.name, barcode=it.barcode, qty=it.qty,
            cost=it.cost if it.cost is not None else it.price,
        ))

    await session.commit()
    return await _support_doc_out(session, doc)


@invoices_router.get("/support-docs", response_model=List[SupportDocOut])
async def list_support_docs(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(SupportDoc).order_by(SupportDoc.created_at.desc()).limit(300)
    docs = (await session.execute(stmt)).scalars().all()
    return [await _support_doc_out(session, d) for d in docs]


@invoices_router.get("/invoices/purchase")
async def list_purchase_invoices(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(PurchaseInvoice).order_by(PurchaseInvoice.created_at.desc()).limit(200)
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
