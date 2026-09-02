from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import base64
import json
import logging
import re
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="AbarrotesPOS API")
api_router = APIRouter(prefix="/api")


# ----------------- Helpers -----------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_doc(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    return doc


# ----------------- Models -----------------
class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = "General"
    price: float = 0.0
    cost: float = 0.0
    stock: float = 0.0
    unit: str = "und"
    tax_rate: float = 19.0  # IVA Colombia
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ProductCreate(BaseModel):
    name: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = "General"
    price: float = 0.0
    cost: float = 0.0
    stock: float = 0.0
    unit: str = "und"
    tax_rate: float = 19.0
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    cost: Optional[float] = None
    stock: Optional[float] = None
    unit: Optional[str] = None
    tax_rate: Optional[float] = None
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None


class SaleItem(BaseModel):
    product_id: str
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    tax_rate: float = 19.0
    subtotal: float


class Sale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    items: List[SaleItem]
    subtotal: float
    tax_total: float
    discount: float = 0.0
    total: float
    payment_method: str = "efectivo"
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    cashier: Optional[str] = "Cajero"
    notes: Optional[str] = None
    is_credit: bool = False
    balance_due: float = 0.0
    credit_status: str = "paid"  # paid | pending | partial
    created_at: str = Field(default_factory=now_iso)


class Payment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sale_id: str
    sale_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    amount: float
    method: str = "efectivo"
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class PaymentCreate(BaseModel):
    sale_id: str
    amount: float
    method: str = "efectivo"
    notes: Optional[str] = None


class SaleCreate(BaseModel):
    items: List[SaleItem]
    discount: float = 0.0
    payment_method: str = "efectivo"
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None


class Contact(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kind: str  # "customer" or "supplier"
    name: str
    document: Optional[str] = None  # NIT/Cédula
    document_type: Optional[str] = "CC"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class ContactCreate(BaseModel):
    kind: str
    name: str
    document: Optional[str] = None
    document_type: Optional[str] = "CC"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None


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


class ManualInvoice(BaseModel):
    supplier_name: Optional[str] = None
    supplier_nit: Optional[str] = None
    invoice_number: Optional[str] = None
    date: Optional[str] = None
    items: List[InvoiceItemOCR]


class ImportInvoiceRequest(BaseModel):
    supplier_name: Optional[str] = None
    supplier_nit: Optional[str] = None
    invoice_number: Optional[str] = None
    date: Optional[str] = None
    items: List[dict]  # each: {name, barcode, quantity, unit_price, selling_price, category, tax_rate}


# ----------------- Products -----------------
@api_router.post("/products", response_model=Product)
async def create_product(payload: ProductCreate):
    prod = Product(**payload.model_dump())
    await db.products.insert_one(prod.model_dump())
    return prod


@api_router.get("/products", response_model=List[Product])
async def list_products(q: Optional[str] = None, category: Optional[str] = None, limit: int = 500):
    query: dict = {}
    if q:
        regex = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": regex}, {"barcode": regex}, {"sku": regex}]
    if category and category != "all":
        query["category"] = category
    docs = await db.products.find(query, {"_id": 0}).limit(limit).to_list(limit)
    return [Product(**d) for d in docs]


@api_router.get("/products/barcode/{code}")
async def get_product_by_barcode(code: str):
    doc = await db.products.find_one({"barcode": code}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return Product(**doc)


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return Product(**doc)


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, payload: ProductUpdate):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    res = await db.products.update_one({"id": product_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    doc = await db.products.find_one({"id": product_id}, {"_id": 0})
    return Product(**doc)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str):
    res = await db.products.delete_one({"id": product_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return {"ok": True}


@api_router.get("/categories")
async def list_categories():
    """Return categories with product counts, based on current inventory."""
    pipeline = [
        {"$group": {"_id": "$category", "count": {"$sum": 1}, "stock": {"$sum": "$stock"}}},
        {"$sort": {"count": -1}},
    ]
    docs = await db.products.aggregate(pipeline).to_list(500)
    return [
        {"name": d["_id"] or "General", "count": d["count"], "stock": float(d.get("stock") or 0)}
        for d in docs
        if d["_id"]
    ]


# ----------------- Sales / POS -----------------
async def next_sale_number() -> str:
    count = await db.sales.count_documents({})
    return f"POS-{(count + 1):06d}"


@api_router.post("/sales", response_model=Sale)
async def create_sale(payload: SaleCreate):
    # Recalculate totals server-side for integrity
    items: List[SaleItem] = []
    subtotal = 0.0
    tax_total = 0.0
    for it in payload.items:
        line_sub = round(it.qty * it.price, 2)
        line_tax = round(line_sub * (it.tax_rate / 100.0) / (1 + it.tax_rate / 100.0), 2) if it.tax_rate else 0.0
        # We assume prices already include IVA (Colombia retail convention)
        items.append(SaleItem(
            product_id=it.product_id,
            name=it.name,
            barcode=it.barcode,
            qty=it.qty,
            price=it.price,
            tax_rate=it.tax_rate,
            subtotal=line_sub,
        ))
        subtotal += line_sub
        tax_total += line_tax

    discount = payload.discount or 0.0
    total = round(subtotal - discount, 2)
    number = await next_sale_number()
    is_credit = payload.payment_method == "credito"
    if is_credit and not payload.customer_id:
        raise HTTPException(status_code=400, detail="Debes seleccionar un cliente para venta a crédito (fiado)")
    sale = Sale(
        number=number,
        items=items,
        subtotal=round(subtotal, 2),
        tax_total=round(tax_total, 2),
        discount=round(discount, 2),
        total=total,
        payment_method=payload.payment_method,
        customer_id=payload.customer_id,
        customer_name=payload.customer_name,
        notes=payload.notes,
        is_credit=is_credit,
        balance_due=total if is_credit else 0.0,
        credit_status="pending" if is_credit else "paid",
    )
    await db.sales.insert_one(sale.model_dump())

    # Decrease stock
    for it in items:
        await db.products.update_one({"id": it.product_id}, {"$inc": {"stock": -it.qty}})
    return sale


@api_router.get("/sales", response_model=List[Sale])
async def list_sales(limit: int = 100):
    docs = await db.sales.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return [Sale(**d) for d in docs]


@api_router.get("/sales/{sale_id}", response_model=Sale)
async def get_sale(sale_id: str):
    doc = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return Sale(**doc)


# ----------------- Credits / Fiado -----------------
@api_router.post("/credits/payment", response_model=Payment)
async def register_payment(payload: PaymentCreate):
    sale_doc = await db.sales.find_one({"id": payload.sale_id}, {"_id": 0})
    if not sale_doc:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if not sale_doc.get("is_credit"):
        raise HTTPException(status_code=400, detail="Esta venta no es a crédito")
    current_balance = float(sale_doc.get("balance_due", 0))
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El abono debe ser mayor a 0")
    if amount > current_balance + 0.01:
        raise HTTPException(status_code=400, detail=f"El abono supera el saldo pendiente ({current_balance})")

    new_balance = round(current_balance - amount, 2)
    status = "paid" if new_balance <= 0.009 else "partial"
    await db.sales.update_one(
        {"id": payload.sale_id},
        {"$set": {"balance_due": new_balance, "credit_status": status}}
    )

    pay = Payment(
        sale_id=payload.sale_id,
        sale_number=sale_doc.get("number"),
        customer_id=sale_doc.get("customer_id"),
        customer_name=sale_doc.get("customer_name"),
        amount=round(amount, 2),
        method=payload.method,
        notes=payload.notes,
    )
    await db.payments.insert_one(pay.model_dump())
    return pay


@api_router.get("/credits/summary")
async def credits_summary():
    """List customers with pending balance and totals."""
    sales = await db.sales.find(
        {"is_credit": True, "credit_status": {"$in": ["pending", "partial"]}},
        {"_id": 0},
    ).to_list(5000)
    by_customer = {}
    for s in sales:
        key = s.get("customer_id") or "sin_id"
        entry = by_customer.setdefault(key, {
            "customer_id": s.get("customer_id"),
            "customer_name": s.get("customer_name") or "Sin cliente",
            "total_due": 0.0,
            "sales_count": 0,
            "oldest_date": s.get("created_at"),
        })
        entry["total_due"] += float(s.get("balance_due", 0))
        entry["sales_count"] += 1
        if s.get("created_at") and s.get("created_at") < entry["oldest_date"]:
            entry["oldest_date"] = s.get("created_at")
    result = sorted(by_customer.values(), key=lambda x: x["total_due"], reverse=True)
    total = sum(x["total_due"] for x in result)
    return {"customers": result, "total_due": round(total, 2)}


@api_router.get("/credits/customer/{customer_id}")
async def credit_statement(customer_id: str):
    contact = await db.contacts.find_one({"id": customer_id}, {"_id": 0})
    sales = await db.sales.find({"customer_id": customer_id, "is_credit": True}, {"_id": 0}).sort("created_at", -1).to_list(500)
    payments = await db.payments.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(500)
    total_credit = sum(float(s.get("total", 0)) for s in sales)
    total_paid = sum(float(p.get("amount", 0)) for p in payments)
    balance = round(total_credit - total_paid, 2)
    return {
        "customer": contact,
        "sales": sales,
        "payments": payments,
        "total_credit": round(total_credit, 2),
        "total_paid": round(total_paid, 2),
        "balance": balance,
    }


@api_router.get("/credits/pending-sales")
async def pending_credit_sales(customer_id: Optional[str] = None):
    q: dict = {"is_credit": True, "credit_status": {"$in": ["pending", "partial"]}}
    if customer_id:
        q["customer_id"] = customer_id
    sales = await db.sales.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return sales


# ----------------- Contacts (customers/suppliers) -----------------
@api_router.post("/contacts", response_model=Contact)
async def create_contact(payload: ContactCreate):
    c = Contact(**payload.model_dump())
    await db.contacts.insert_one(c.model_dump())
    return c


@api_router.get("/contacts", response_model=List[Contact])
async def list_contacts(kind: Optional[str] = None):
    query: dict = {}
    if kind:
        query["kind"] = kind
    docs = await db.contacts.find(query, {"_id": 0}).to_list(1000)
    return [Contact(**d) for d in docs]


@api_router.put("/contacts/{contact_id}", response_model=Contact)
async def update_contact(contact_id: str, payload: ContactCreate):
    updates = payload.model_dump()
    res = await db.contacts.update_one({"id": contact_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    doc = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    return Contact(**doc)


@api_router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str):
    res = await db.contacts.delete_one({"id": contact_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    return {"ok": True}


# ----------------- Invoice OCR (Gemini vision) -----------------
OCR_SYSTEM = (
    "Eres un extractor experto de facturas colombianas para una tienda de abarrotes. "
    "Devuelve SOLO un JSON válido, sin explicaciones, con este esquema exacto: "
    '{"supplier_name": string, "supplier_nit": string, "invoice_number": string, "date": string(YYYY-MM-DD), '
    '"subtotal": number, "tax": number, "total": number, '
    '"items": [{"name": string, "quantity": number, "unit_price": number, "total": number, "barcode": string}]}. '
    "Los precios deben ser números en pesos colombianos (COP) sin puntos ni comas. Si no logras leer un valor, usa 0 o cadena vacía. Nunca inventes."
)


def _extract_json(text: str) -> dict:
    # find first { ... last }
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text[start:end + 1])
    except Exception:
        # try to strip code fences
        cleaned = re.sub(r"```(json)?", "", text).replace("```", "")
        s2 = cleaned.find("{")
        e2 = cleaned.rfind("}")
        try:
            return json.loads(cleaned[s2:e2 + 1])
        except Exception:
            return {}


@api_router.post("/invoices/ocr", response_model=InvoiceOCR)
async def ocr_invoice(payload: OCRRequest):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY no configurada")

    # accept models: gemini-3.1-pro-preview (accurate) or gemini-3-flash-preview (economic)
    model = payload.model or "gemini-3-flash-preview"
    session_id = f"ocr-{uuid.uuid4()}"
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=OCR_SYSTEM,
    ).with_model("gemini", model)

    # Strip data URL prefix if present
    img_b64 = payload.image_base64
    if img_b64.startswith("data:"):
        img_b64 = img_b64.split(",", 1)[-1]

    image = ImageContent(image_base64=img_b64)
    msg = UserMessage(
        text=(
            "Extrae los datos de esta factura de compra. Devuelve SOLO el JSON con el esquema pedido. "
            "Incluye cada línea de producto en 'items'."
        ),
        file_contents=[image],
    )

    try:
        response_text = await chat.send_message(msg)
    except Exception as e:
        logging.exception("OCR error")
        raise HTTPException(status_code=502, detail=f"Error al procesar imagen: {e}")

    parsed = _extract_json(response_text if isinstance(response_text, str) else str(response_text))
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


@api_router.post("/invoices/import")
async def import_invoice_to_inventory(payload: ImportInvoiceRequest):
    """Given confirmed invoice items, upsert products (by barcode or name) and increment stock."""
    imported = 0
    updated = 0
    supplier_id = None
    if payload.supplier_name:
        existing = await db.contacts.find_one({"name": payload.supplier_name, "kind": "supplier"}, {"_id": 0})
        if not existing:
            supplier = Contact(kind="supplier", name=payload.supplier_name, document=payload.supplier_nit)
            await db.contacts.insert_one(supplier.model_dump())
            supplier_id = supplier.id
        else:
            supplier_id = existing.get("id")

    for it in payload.items:
        name = (it.get("name") or "").strip()
        barcode = (it.get("barcode") or "").strip() or None
        qty = float(it.get("quantity", 0) or 0)
        unit_cost = float(it.get("unit_price", 0) or 0)
        selling_price = float(it.get("selling_price", 0) or 0)
        category = (it.get("category") or "General").strip() or "General"
        tax_rate = float(it.get("tax_rate", 19) or 19)

        if not name:
            continue

        existing = None
        if barcode:
            existing = await db.products.find_one({"barcode": barcode}, {"_id": 0})
        if not existing:
            existing = await db.products.find_one({"name": name}, {"_id": 0})

        if existing:
            new_stock = float(existing.get("stock", 0)) + qty
            updates = {
                "stock": new_stock,
                "cost": unit_cost or existing.get("cost", 0),
                "updated_at": now_iso(),
            }
            if selling_price > 0:
                updates["price"] = selling_price
            if supplier_id:
                updates["supplier_id"] = supplier_id
            await db.products.update_one({"id": existing["id"]}, {"$set": updates})
            updated += 1
        else:
            prod = Product(
                name=name,
                barcode=barcode,
                category=category,
                cost=unit_cost,
                price=selling_price or round(unit_cost * 1.3, 2),
                stock=qty,
                tax_rate=tax_rate,
                supplier_id=supplier_id,
            )
            await db.products.insert_one(prod.model_dump())
            imported += 1

    # Save invoice record
    inv_id = str(uuid.uuid4())
    await db.purchase_invoices.insert_one({
        "id": inv_id,
        "supplier_name": payload.supplier_name,
        "supplier_nit": payload.supplier_nit,
        "invoice_number": payload.invoice_number,
        "date": payload.date,
        "items": payload.items,
        "created_at": now_iso(),
    })

    return {"ok": True, "imported": imported, "updated": updated, "invoice_id": inv_id}


@api_router.get("/invoices/purchase")
async def list_purchase_invoices():
    docs = await db.purchase_invoices.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return docs


# ----------------- Reports / Dashboard -----------------
@api_router.get("/reports/summary")
async def report_summary():
    sales = await db.sales.find({}, {"_id": 0}).to_list(5000)
    products = await db.products.find({}, {"_id": 0}).to_list(5000)
    total_sales = sum(s.get("total", 0) for s in sales)
    total_count = len(sales)
    total_products = len(products)
    low_stock = [p for p in products if float(p.get("stock", 0)) <= 5]

    # today's sales
    today = datetime.now(timezone.utc).date().isoformat()
    todays = [s for s in sales if str(s.get("created_at", "")).startswith(today)]
    todays_total = sum(s.get("total", 0) for s in todays)

    # top products
    counter = {}
    for s in sales:
        for it in s.get("items", []):
            key = it.get("name") or it.get("product_id")
            counter[key] = counter.get(key, 0) + float(it.get("qty", 0))
    top = sorted(counter.items(), key=lambda x: x[1], reverse=True)[:5]

    # last 7 days
    from collections import defaultdict
    daily = defaultdict(float)
    for s in sales:
        d = str(s.get("created_at", ""))[:10]
        if d:
            daily[d] += float(s.get("total", 0))
    daily_sorted = sorted(daily.items())[-7:]

    return {
        "total_sales": round(total_sales, 2),
        "sales_count": total_count,
        "products_count": total_products,
        "low_stock_count": len(low_stock),
        "todays_sales": round(todays_total, 2),
        "todays_count": len(todays),
        "top_products": [{"name": k, "qty": v} for k, v in top],
        "daily_sales": [{"date": d, "total": round(v, 2)} for d, v in daily_sorted],
        "low_stock": low_stock[:10],
    }


# ----------------- Seed sample data -----------------
@api_router.post("/seed")
async def seed_data():
    existing = await db.products.count_documents({})
    if existing > 0:
        return {"ok": True, "seeded": False, "message": "Ya existen datos"}
    sample = [
        {"name": "Arroz Diana 500g", "barcode": "7702001010011", "category": "Granos", "price": 2500, "cost": 1800, "stock": 40, "unit": "und"},
        {"name": "Aceite Girasol 1L", "barcode": "7702001010028", "category": "Aceites", "price": 12500, "cost": 9800, "stock": 22, "unit": "und"},
        {"name": "Panela cuadrada 500g", "barcode": "7702001010035", "category": "Endulzantes", "price": 3800, "cost": 2600, "stock": 30, "unit": "und"},
        {"name": "Leche Alqueria 1L", "barcode": "7702001010042", "category": "Lácteos", "price": 4800, "cost": 3600, "stock": 25, "unit": "und"},
        {"name": "Huevos AA x30", "barcode": "7702001010059", "category": "Huevos", "price": 18500, "cost": 14000, "stock": 12, "unit": "und"},
        {"name": "Pan tajado Bimbo", "barcode": "7702001010066", "category": "Panadería", "price": 6900, "cost": 4900, "stock": 15, "unit": "und"},
        {"name": "Café Sello Rojo 250g", "barcode": "7702001010073", "category": "Café", "price": 9800, "cost": 7000, "stock": 20, "unit": "und"},
        {"name": "Frijol rojo 500g", "barcode": "7702001010080", "category": "Granos", "price": 5200, "cost": 3800, "stock": 18, "unit": "und"},
        {"name": "Coca-Cola 1.5L", "barcode": "7702001010097", "category": "Bebidas", "price": 5500, "cost": 4100, "stock": 30, "unit": "und"},
        {"name": "Jabón Rey 300g", "barcode": "7702001010103", "category": "Aseo", "price": 4200, "cost": 3000, "stock": 24, "unit": "und"},
        {"name": "Chocolatina Jet", "barcode": "7702001010110", "category": "Golosinas", "price": 1200, "cost": 800, "stock": 60, "unit": "und"},
        {"name": "Papas Margarita 105g", "barcode": "7702001010127", "category": "Snacks", "price": 4500, "cost": 3200, "stock": 3, "unit": "und"},
    ]
    docs = [Product(**p).model_dump() for p in sample]
    await db.products.insert_many(docs)

    contacts = [
        {"kind": "supplier", "name": "Distribuidora La Cosecha", "document": "900123456-7", "phone": "3001112233", "city": "Bogotá"},
        {"kind": "supplier", "name": "Nutresa S.A.", "document": "890900608-9", "phone": "6045118111", "city": "Medellín"},
        {"kind": "customer", "name": "Consumidor Final", "document": "222222222222", "document_type": "NIT"},
        {"kind": "customer", "name": "María López", "document": "1020304050", "document_type": "CC", "phone": "3113334455"},
    ]
    await db.contacts.insert_many([Contact(**c).model_dump() for c in contacts])

    return {"ok": True, "seeded": True, "products": len(docs), "contacts": len(contacts)}


@api_router.get("/")
async def root():
    return {"message": "AbarrotesPOS API", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
