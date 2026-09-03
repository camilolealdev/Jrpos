from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import base64
import hashlib
import json
import logging
import re
import secrets
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

app = FastAPI(title="JRPOS API")


# ----------------- Auth (JWT) -----------------
JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {"sub": user_id, "email": email, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(hours=8), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuario no encontrado")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Solo administradores")
    return user


def set_auth_cookies(response: Response, user: dict):
    access = create_access_token(user["id"], user["email"], user.get("role", "cajero"))
    refresh = create_refresh_token(user["id"])
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=8 * 3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=7 * 86400, path="/")


class LoginRequest(BaseModel):
    email: str
    password: str


auth_router = APIRouter(prefix="/api/auth")


@auth_router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email.strip().lower()
    # Bloqueo por CUENTA (el IP del ingress rota entre réplicas del balanceador)
    identifier = email
    attempts = await db.login_attempts.find_one({"identifier": identifier}, {"_id": 0})
    if attempts and attempts.get("count", 0) >= 5:
        locked_until = attempts.get("locked_until")
        if locked_until and locked_until > now_iso():
            raise HTTPException(
                status_code=429,
                detail="Cuenta bloqueada temporalmente por demasiados intentos. Espera 15 minutos.",
                headers={"Retry-After": "900"},
            )
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        new_count = (attempts.get("count", 0) if attempts else 0) + 1
        await db.login_attempts.update_one(
            {"identifier": identifier},
            {"$set": {"count": new_count,
                      "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}},
            upsert=True,
        )
        if new_count >= 5:
            raise HTTPException(
                status_code=429,
                detail="Cuenta bloqueada temporalmente por demasiados intentos. Espera 15 minutos.",
                headers={"Retry-After": "900"},
            )
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    await db.login_attempts.delete_one({"identifier": identifier})
    set_auth_cookies(response, user)
    user.pop("password_hash", None)
    return user


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@auth_router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Sin refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Token inválido")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    access = create_access_token(user["id"], user["email"], user.get("role", "cajero"))
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=8 * 3600, path="/")
    return {"ok": True}


@app.on_event("startup")
async def startup_auth():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if not existing:
            # Migración: si ya hay un admin con otro correo, actualizarlo al nuevo
            old_admin = await db.users.find_one({"role": "admin"})
            if old_admin:
                await db.users.update_one(
                    {"id": old_admin["id"]},
                    {"$set": {"email": admin_email, "password_hash": hash_password(admin_password)}},
                )
            else:
                await db.users.insert_one({
                    "id": str(uuid.uuid4()), "email": admin_email,
                    "password_hash": hash_password(admin_password),
                    "name": "Administrador", "role": "admin",
                    "created_at": now_iso(),
                })
        elif not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


api_router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])


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
    is_service: bool = False
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
    is_service: bool = False


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
    is_service: Optional[bool] = None


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
async def list_products(q: Optional[str] = None, category: Optional[str] = None, categories: Optional[str] = None, limit: int = 500):
    query: dict = {}
    if q:
        regex = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": regex}, {"barcode": regex}, {"sku": regex}]
    cat_list = []
    if categories:
        cat_list = [c.strip() for c in categories.split(",") if c.strip() and c.strip() != "all"]
    if cat_list:
        query["category"] = {"$in": cat_list}
    elif category and category != "all":
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
    """Return categories with product counts and meta (emoji + pin + order)."""
    pipeline = [
        {"$group": {"_id": "$category", "count": {"$sum": 1}, "stock": {"$sum": "$stock"}}},
    ]
    docs = await db.products.aggregate(pipeline).to_list(500)
    metas = await db.category_meta.find({}, {"_id": 0}).to_list(500)
    meta_by_name = {m["name"]: m for m in metas}
    result = []
    for d in docs:
        if not d["_id"]:
            continue
        m = meta_by_name.get(d["_id"], {})
        result.append({
            "name": d["_id"],
            "count": d["count"],
            "stock": float(d.get("stock") or 0),
            "emoji": m.get("emoji"),
            "pinned": bool(m.get("pinned", False)),
            "order": int(m.get("order", 999)),
        })
    # Sort: pinned first (by order), then by count desc
    result.sort(key=lambda x: (not x["pinned"], x["order"] if x["pinned"] else 0, -x["count"]))
    return result


class CategoryMetaUpsert(BaseModel):
    name: str
    emoji: Optional[str] = None
    pinned: Optional[bool] = None
    order: Optional[int] = None


@api_router.put("/categories/meta")
async def upsert_category_meta(payload: CategoryMetaUpsert):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None and k != "name"}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para actualizar")
    await db.category_meta.update_one({"name": payload.name}, {"$set": {"name": payload.name, **updates}}, upsert=True)
    doc = await db.category_meta.find_one({"name": payload.name}, {"_id": 0})
    return doc


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

    # Decrease stock (servicios no descuentan inventario)
    for it in items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0, "is_service": 1})
        if not (p and p.get("is_service")):
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


# ----------------- Bulk inventory -----------------
@api_router.post("/products/bulk")
async def bulk_create_products(rows: List[ProductCreate]):
    created = 0
    updated = 0
    for r in rows:
        existing = None
        if r.barcode:
            existing = await db.products.find_one({"barcode": r.barcode}, {"_id": 0})
        if not existing:
            existing = await db.products.find_one({"name": r.name}, {"_id": 0})
        if existing:
            await db.products.update_one(
                {"id": existing["id"]},
                {"$set": {"price": r.price, "cost": r.cost, "category": r.category or existing.get("category"), "updated_at": now_iso()},
                 "$inc": {"stock": r.stock}},
            )
            updated += 1
        else:
            await db.products.insert_one(Product(**r.model_dump()).model_dump())
            created += 1
    return {"ok": True, "created": created, "updated": updated, "total": len(rows)}


class BulkUpdateRequest(BaseModel):
    category: Optional[str] = None
    percent_price: Optional[float] = None   # +10 sube 10%, -5 baja 5%
    percent_cost: Optional[float] = None
    set_tax: Optional[float] = None
    add_stock: Optional[float] = None


@api_router.post("/products/bulk-update")
async def bulk_update_products(payload: BulkUpdateRequest):
    query: dict = {}
    if payload.category and payload.category != "all":
        query["category"] = payload.category
    docs = await db.products.find(query, {"_id": 0}).to_list(5000)
    changed = 0
    for p in docs:
        updates: dict = {"updated_at": now_iso()}
        if payload.percent_price is not None:
            updates["price"] = round(float(p.get("price", 0)) * (1 + payload.percent_price / 100.0), 2)
        if payload.percent_cost is not None:
            updates["cost"] = round(float(p.get("cost", 0)) * (1 + payload.percent_cost / 100.0), 2)
        if payload.set_tax is not None:
            updates["tax_rate"] = payload.set_tax
        if payload.add_stock is not None:
            updates["stock"] = round(float(p.get("stock", 0)) + payload.add_stock, 2)
        await db.products.update_one({"id": p["id"]}, {"$set": updates})
        changed += 1
    return {"ok": True, "updated": changed}


# ----------------- Expenses (Gastos) -----------------
class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    concept: str
    category: str = "General"
    amount: float
    method: str = "efectivo"
    supplier_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class ExpenseCreate(BaseModel):
    concept: str
    category: str = "General"
    amount: float
    method: str = "efectivo"
    supplier_id: Optional[str] = None
    notes: Optional[str] = None


@api_router.post("/expenses", response_model=Expense)
async def create_expense(payload: ExpenseCreate):
    e = Expense(**payload.model_dump())
    await db.expenses.insert_one(e.model_dump())
    return e


@api_router.get("/expenses")
async def list_expenses(limit: int = 300):
    docs = await db.expenses.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    total = sum(float(d.get("amount", 0)) for d in docs)
    today = datetime.now(timezone.utc).date().isoformat()
    today_total = sum(float(d.get("amount", 0)) for d in docs if str(d.get("created_at", "")).startswith(today))
    month_total = sum(float(d.get("amount", 0)) for d in docs if str(d.get("created_at", "")).startswith(today[:7]))
    return {"expenses": docs, "total": round(total, 2), "today": round(today_total, 2), "month": round(month_total, 2)}


@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str):
    res = await db.expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    return {"ok": True}


# ----------------- Held accounts (POS multi-cliente) -----------------
class HeldSale(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    items: List[dict]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    total: float = 0.0
    created_at: str = Field(default_factory=now_iso)


class HeldSaleCreate(BaseModel):
    label: str
    items: List[dict]
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None


@api_router.post("/held", response_model=HeldSale)
async def hold_sale(payload: HeldSaleCreate):
    total = sum(float(it.get("qty", 0)) * float(it.get("price", 0)) for it in payload.items)
    h = HeldSale(**payload.model_dump(), total=round(total, 2))
    await db.held_sales.insert_one(h.model_dump())
    return h


@api_router.get("/held", response_model=List[HeldSale])
async def list_held():
    docs = await db.held_sales.find({}, {"_id": 0}).sort("created_at", 1).to_list(100)
    return [HeldSale(**d) for d in docs]


@api_router.delete("/held/{held_id}")
async def delete_held(held_id: str):
    res = await db.held_sales.delete_one({"id": held_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    return {"ok": True}


# ----------------- POS Electrónica (SIMULADA DIAN) -----------------
class ElectronicSettings(BaseModel):
    nit: str = ""
    razon_social: str = ""
    resolucion: str = ""
    prefijo: str = "FE"
    rango_desde: int = 1
    rango_hasta: int = 999999
    fecha_resolucion: str = ""


@api_router.get("/electronic/settings")
async def get_electronic_settings():
    doc = await db.settings.find_one({"key": "electronic"}, {"_id": 0})
    if not doc:
        return ElectronicSettings().model_dump()
    return doc["value"]


@api_router.put("/electronic/settings")
async def save_electronic_settings(payload: ElectronicSettings):
    await db.settings.update_one(
        {"key": "electronic"},
        {"$set": {"key": "electronic", "value": payload.model_dump()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/electronic/invoice/{sale_id}")
async def electronic_invoice(sale_id: str):
    """Genera CUFE y XML UBL SIMULADOS para la venta. No válido ante la DIAN real."""
    sale = await db.sales.find_one({"id": sale_id}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    settings_doc = await db.settings.find_one({"key": "electronic"}, {"_id": 0})
    st = (settings_doc or {}).get("value") or ElectronicSettings().model_dump()

    number = f"{st.get('prefijo', 'FE')}{sale.get('number', '')}"
    date = str(sale.get("created_at", ""))
    total = float(sale.get("total", 0))
    cufe = hashlib.sha256(f"{number}{date}{total}{st.get('nit')}{st.get('resolucion')}".encode()).hexdigest()

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- SIMULACIÓN - Documento NO válido ante la DIAN -->
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <UBLVersionID>UBL 2.1</UBLVersionID>
  <ID>{number}</ID>
  <IssueDate>{date[:10]}</IssueDate>
  <InvoiceTypeCode>01</InvoiceTypeCode>
  <DocumentCurrencyCode>COP</DocumentCurrencyCode>
  <AccountingSupplierParty>
    <Party><PartyName><Name>{st.get('razon_social')}</Name></PartyName>
    <PartyTaxScheme><CompanyID>{st.get('nit')}</CompanyID></PartyTaxScheme></Party>
  </AccountingSupplierParty>
  <LegalMonetaryTotal>
    <LineExtensionAmount currencyID="COP">{sale.get('subtotal')}</LineExtensionAmount>
    <TaxInclusiveAmount currencyID="COP">{total}</TaxInclusiveAmount>
    <PayableAmount currencyID="COP">{total}</PayableAmount>
  </LegalMonetaryTotal>
  <CUFE>{cufe}</CUFE>
</Invoice>"""

    await db.sales.update_one(
        {"id": sale_id},
        {"$set": {"cufe": cufe, "electronic_number": number, "electronic_status": "simulada"}},
    )
    return {"number": number, "cufe": cufe, "xml": xml, "status": "simulada"}


# ----------------- Marcación (entrada/salida de empleados) -----------------
class TimeclockSchedule(BaseModel):
    entry_time: str = "08:00"
    exit_time: str = "18:00"
    tolerance_minutes: int = 10


@api_router.get("/timeclock/schedule")
async def get_schedule():
    doc = await db.settings.find_one({"key": "timeclock_schedule"}, {"_id": 0})
    base = TimeclockSchedule().model_dump()
    if doc:
        base.update(doc.get("value") or {})
    return base


@api_router.put("/timeclock/schedule")
async def save_schedule(payload: TimeclockSchedule, admin: dict = Depends(require_admin)):
    await db.settings.update_one(
        {"key": "timeclock_schedule"},
        {"$set": {"key": "timeclock_schedule", "value": payload.model_dump()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/timeclock/mark")
async def mark_timeclock(payload: dict, user: dict = Depends(get_current_user)):
    mark_type = payload.get("type")
    if mark_type not in ("in", "out"):
        raise HTTPException(status_code=400, detail="Tipo debe ser 'in' (entrada) u 'out' (salida)")
    # No permitir dos marcas iguales seguidas
    last = await db.timeclock.find_one({"user_id": user["id"]}, {"_id": 0}, sort=[("created_at", -1)])
    if last and last.get("type") == mark_type:
        raise HTTPException(status_code=400, detail=f"Ya marcaste {'entrada' if mark_type == 'in' else 'salida'}; marca primero lo contrario")
    # Salida requiere una entrada previa en el día
    if mark_type == "out":
        today = datetime.now(timezone.utc).date().isoformat()
        has_in = await db.timeclock.find_one({"user_id": user["id"], "type": "in", "created_at": {"$regex": f"^{today}"}})
        if not has_in:
            raise HTTPException(status_code=400, detail="No puedes marcar salida sin haber marcado entrada hoy")

    now = datetime.now(timezone.utc)
    late = False
    if mark_type == "in":
        sched = await get_schedule()
        try:
            hh, mm = sched["entry_time"].split(":")
            limit = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0) + timedelta(minutes=int(sched.get("tolerance_minutes", 0)))
            late = now > limit
        except Exception:
            late = False

    mark = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_name": user.get("name") or user.get("email"),
        "role": user.get("role"),
        "type": mark_type,
        "late": late,
        "note": payload.get("note"),
        "created_at": now.isoformat(),
    }
    await db.timeclock.insert_one(mark)
    mark.pop("_id", None)
    return mark


@api_router.get("/timeclock/today")
async def my_timeclock_today(user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    marks = await db.timeclock.find({"user_id": user["id"], "created_at": {"$regex": f"^{today}"}}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return marks


@api_router.get("/timeclock/records")
async def timeclock_records(date: Optional[str] = None, admin: dict = Depends(require_admin)):
    day = date or datetime.now(timezone.utc).date().isoformat()
    marks = await db.timeclock.find({"created_at": {"$regex": f"^{day}"}}, {"_id": 0}).sort("created_at", 1).to_list(500)
    by_user = {}
    for m in marks:
        by_user.setdefault(m["user_name"], []).append(m)
    return {"date": day, "employees": [{"name": k, "marks": v} for k, v in by_user.items()]}


# ----------------- Recogidas de Dinero / Arqueo de Caja -----------------
@api_router.post("/cash/open")
async def open_cash(payload: dict, user: dict = Depends(get_current_user)):
    existing = await db.cash_sessions.find_one({"user_id": user["id"], "status": "open"}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Ya tienes una caja abierta. Ciérrala primero.")
    base = float(payload.get("base", 0) or 0)
    if base < 0:
        raise HTTPException(status_code=400, detail="La base no puede ser negativa")
    session = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "opened_by": user.get("name") or user.get("email"),
        "opened_at": now_iso(),
        "base": base,
        "status": "open",
        "pickups": [],
    }
    await db.cash_sessions.insert_one(session)
    session.pop("_id", None)
    return session


async def _session_totals(session: dict) -> dict:
    """Ventas en efectivo desde la apertura + recogidas."""
    cash_sales = await db.sales.find(
        {"payment_method": "efectivo", "created_at": {"$gte": session["opened_at"]}},
        {"_id": 0, "total": 1},
    ).to_list(5000)
    sales_total = sum(float(s.get("total", 0)) for s in cash_sales)
    pickups_total = sum(float(p.get("amount", 0)) for p in session.get("pickups", []))
    expected = round(session.get("base", 0) + sales_total - pickups_total, 2)
    return {"sales_total": round(sales_total, 2), "sales_count": len(cash_sales),
            "pickups_total": round(pickups_total, 2), "expected": expected}


@api_router.get("/cash/current")
async def current_cash(user: dict = Depends(get_current_user)):
    session = await db.cash_sessions.find_one({"user_id": user["id"], "status": "open"}, {"_id": 0})
    if not session:
        return {"open": False}
    totals = await _session_totals(session)
    return {"open": True, "session": session, **totals}


@api_router.post("/cash/pickup")
async def cash_pickup(payload: dict, user: dict = Depends(get_current_user)):
    session = await db.cash_sessions.find_one({"user_id": user["id"], "status": "open"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=400, detail="No tienes caja abierta")
    amount = float(payload.get("amount", 0) or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor a 0")
    pickup = {"id": str(uuid.uuid4()), "amount": amount, "notes": payload.get("notes"),
              "by": user.get("name"), "created_at": now_iso()}
    await db.cash_sessions.update_one({"id": session["id"]}, {"$push": {"pickups": pickup}})
    return pickup


@api_router.post("/cash/close")
async def close_cash(payload: dict, user: dict = Depends(get_current_user)):
    session = await db.cash_sessions.find_one({"user_id": user["id"], "status": "open"}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=400, detail="No tienes caja abierta")
    counted = float(payload.get("counted", 0) or 0)
    totals = await _session_totals(session)
    diff = round(counted - totals["expected"], 2)
    await db.cash_sessions.update_one(
        {"id": session["id"]},
        {"$set": {"status": "closed", "closed_at": now_iso(), "counted": counted,
                  "expected": totals["expected"], "diff": diff, **{k: totals[k] for k in ("sales_total", "sales_count", "pickups_total")}}},
    )
    doc = await db.cash_sessions.find_one({"id": session["id"]}, {"_id": 0})
    return doc


@api_router.get("/cash/history")
async def cash_history(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"user_id": user["id"]}
    docs = await db.cash_sessions.find({**query, "status": "closed"}, {"_id": 0}).sort("closed_at", -1).limit(100).to_list(100)
    return docs


# ----------------- Promociones -----------------
@api_router.get("/promotions")
async def list_promotions():
    return await db.promotions.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.get("/promotions/active")
async def active_promotions():
    today = datetime.now(timezone.utc).date().isoformat()
    docs = await db.promotions.find({"active": True}, {"_id": 0}).to_list(500)
    return [d for d in docs if (not d.get("start") or d["start"] <= today) and (not d.get("end") or d["end"] >= today)]


@api_router.post("/promotions")
async def create_promotion(payload: dict):
    doc = {"id": str(uuid.uuid4()), "name": payload.get("name"), "type": payload.get("type", "percent_all"),
           "value": float(payload.get("value", 0)), "category": payload.get("category"),
           "active": bool(payload.get("active", True)), "start": payload.get("start"), "end": payload.get("end"),
           "created_at": now_iso()}
    if not doc["name"] or doc["value"] <= 0:
        raise HTTPException(status_code=400, detail="Nombre y valor > 0 requeridos")
    await db.promotions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/promotions/{pid}")
async def update_promotion(pid: str, payload: dict):
    updates = {k: v for k, v in payload.items() if k in ("name", "type", "value", "category", "active", "start", "end")}
    res = await db.promotions.update_one({"id": pid}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No encontrada")
    return await db.promotions.find_one({"id": pid}, {"_id": 0})


@api_router.delete("/promotions/{pid}")
async def delete_promotion(pid: str):
    await db.promotions.delete_one({"id": pid})
    return {"ok": True}


# ----------------- Documentos de venta genéricos (cotizaciones, remisiones, cuentas cobro) -----------------
DOC_CFG = {
    "quotes": ("quotes", "COT", "borrador"),
    "remissions": ("remissions", "REM", "pendiente"),
    "collection_accounts": ("collection_accounts", "CC", "pendiente"),
}


async def _next_number(coll: str, prefix: str) -> str:
    return f"{prefix}-{(await db[coll].count_documents({})) + 1:06d}"


@api_router.get("/docs/{kind}")
async def list_docs(kind: str):
    cfg = DOC_CFG.get(kind)
    if not cfg:
        raise HTTPException(status_code=404, detail="Tipo inválido")
    return await db[cfg[0]].find({}, {"_id": 0}).sort("created_at", -1).limit(300).to_list(300)


@api_router.post("/docs/{kind}")
async def create_doc(kind: str, payload: dict):
    cfg = DOC_CFG.get(kind)
    if not cfg:
        raise HTTPException(status_code=404, detail="Tipo inválido")
    items = payload.get("items", [])
    total = round(sum(float(i.get("qty", 0)) * float(i.get("price", 0)) for i in items), 2)
    doc = {"id": str(uuid.uuid4()), "number": await _next_number(cfg[0], cfg[1]),
           "customer_id": payload.get("customer_id"), "customer_name": payload.get("customer_name"),
           "concept": payload.get("concept"), "items": items, "total": total,
           "status": cfg[2], "notes": payload.get("notes"), "created_at": now_iso()}
    if kind == "collection_accounts" and payload.get("amount"):
        doc["total"] = round(float(payload["amount"]), 2)
    await db[cfg[0]].insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/docs/{kind}/{doc_id}")
async def update_doc_status(kind: str, doc_id: str, payload: dict):
    cfg = DOC_CFG.get(kind)
    if not cfg:
        raise HTTPException(status_code=404, detail="Tipo inválido")
    res = await db[cfg[0]].update_one({"id": doc_id}, {"$set": {"status": payload.get("status")}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return await db[cfg[0]].find_one({"id": doc_id}, {"_id": 0})


@api_router.post("/docs/{kind}/{doc_id}/convert")
async def convert_doc_to_sale(kind: str, doc_id: str, user: dict = Depends(get_current_user)):
    cfg = DOC_CFG.get(kind)
    if not cfg or kind == "collection_accounts":
        raise HTTPException(status_code=400, detail="Este documento no se convierte a venta")
    doc = await db[cfg[0]].find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")
    if doc.get("status") == "convertida":
        raise HTTPException(status_code=400, detail="Ya fue convertida")
    items = [SaleItem(product_id=i.get("product_id") or "manual", name=i["name"], barcode=i.get("barcode"),
                      qty=float(i["qty"]), price=float(i["price"]), tax_rate=float(i.get("tax_rate", 19)),
                      subtotal=round(float(i["qty"]) * float(i["price"]), 2)) for i in doc["items"]]
    subtotal = sum(i.subtotal for i in items)
    sale = Sale(number=await next_sale_number(), items=items, subtotal=subtotal,
                tax_total=round(sum(i.subtotal * (i.tax_rate / 100) / (1 + i.tax_rate / 100) for i in items), 2),
                total=subtotal, payment_method="efectivo", customer_id=doc.get("customer_id"),
                customer_name=doc.get("customer_name"), cashier=user.get("name"),
                notes=f"Desde {doc['number']}")
    await db.sales.insert_one(sale.model_dump())
    for it in items:
        p = await db.products.find_one({"id": it.product_id}, {"_id": 0, "is_service": 1})
        if not (p and p.get("is_service")):
            await db.products.update_one({"id": it.product_id}, {"$inc": {"stock": -it.qty}})
    await db[cfg[0]].update_one({"id": doc_id}, {"$set": {"status": "convertida", "sale_id": sale.id}})
    return sale


# ----------------- Notas Crédito / Débito (simuladas DIAN) -----------------
@api_router.post("/credit-notes")
async def create_credit_note(payload: dict):
    sale = await db.sales.find_one({"id": payload.get("sale_id")}, {"_id": 0})
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    ntype = payload.get("type", "credito")
    amount = round(float(payload.get("amount") or sale.get("total", 0)), 2)
    prefix = "NC" if ntype == "credito" else "ND"
    note = {"id": str(uuid.uuid4()), "number": await _next_number("credit_notes", prefix),
            "sale_id": sale["id"], "sale_number": sale["number"], "type": ntype,
            "concept": payload.get("concept", "devolucion"), "amount": amount,
            "cufe": hashlib.sha256(f"{prefix}{sale['number']}{amount}".encode()).hexdigest(),
            "status": "simulada", "created_at": now_iso()}
    await db.credit_notes.insert_one(note)
    note.pop("_id", None)
    # Devolución: re-ingresar stock
    if ntype == "credito" and payload.get("restock", True):
        for it in sale.get("items", []):
            await db.products.update_one({"id": it.get("product_id")}, {"$inc": {"stock": float(it.get("qty", 0))}})
    # Si la venta era a crédito, bajar el saldo
    if ntype == "credito" and sale.get("is_credit"):
        new_bal = max(0.0, round(float(sale.get("balance_due", 0)) - amount, 2))
        await db.sales.update_one({"id": sale["id"]},
                                  {"$set": {"balance_due": new_bal, "credit_status": "paid" if new_bal <= 0 else "partial"}})
    return note


@api_router.get("/credit-notes")
async def list_credit_notes():
    return await db.credit_notes.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


# ----------------- Garantías y Devoluciones -----------------
@api_router.post("/warranties")
async def create_warranty(payload: dict):
    doc = {"id": str(uuid.uuid4()), "number": await _next_number("warranties", "GAR"),
           "sale_id": payload.get("sale_id"), "sale_number": payload.get("sale_number"),
           "product_name": payload.get("product_name"), "reason": payload.get("reason"),
           "resolution": payload.get("resolution", "cambio"), "status": "abierta", "created_at": now_iso()}
    if not doc["product_name"]:
        raise HTTPException(status_code=400, detail="Producto requerido")
    await db.warranties.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/warranties")
async def list_warranties():
    return await db.warranties.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@api_router.put("/warranties/{wid}")
async def update_warranty(wid: str, payload: dict):
    res = await db.warranties.update_one({"id": wid}, {"$set": {"status": payload.get("status"), "resolution": payload.get("resolution")}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="No encontrada")
    return await db.warranties.find_one({"id": wid}, {"_id": 0})


# ----------------- Órdenes de Compra -----------------
@api_router.post("/purchase-orders")
async def create_purchase_order(payload: dict):
    items = payload.get("items", [])
    if not items:
        raise HTTPException(status_code=400, detail="Agrega al menos un ítem")
    doc = {"id": str(uuid.uuid4()), "number": await _next_number("purchase_orders", "OC"),
           "supplier_id": payload.get("supplier_id"), "supplier_name": payload.get("supplier_name"),
           "items": items, "total": round(sum(float(i.get("qty", 0)) * float(i.get("cost", 0)) for i in items), 2),
           "status": "enviada", "created_at": now_iso()}
    await db.purchase_orders.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/purchase-orders")
async def list_purchase_orders():
    return await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


@api_router.post("/purchase-orders/{oid}/receive")
async def receive_purchase_order(oid: str):
    doc = await db.purchase_orders.find_one({"id": oid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrada")
    if doc["status"] == "recibida":
        raise HTTPException(status_code=400, detail="Ya fue recibida")
    for it in doc["items"]:
        existing = None
        if it.get("barcode"):
            existing = await db.products.find_one({"barcode": it["barcode"]})
        if not existing:
            existing = await db.products.find_one({"name": it["name"]})
        if existing:
            await db.products.update_one({"id": existing["id"]},
                                         {"$inc": {"stock": float(it.get("qty", 0))},
                                          "$set": {"cost": float(it.get("cost", 0)), "updated_at": now_iso()}})
        else:
            await db.products.insert_one(Product(name=it["name"], barcode=it.get("barcode"),
                                                 cost=float(it.get("cost", 0)), price=round(float(it.get("cost", 0)) * 1.3, 2),
                                                 stock=float(it.get("qty", 0))).model_dump())
    await db.purchase_orders.update_one({"id": oid}, {"$set": {"status": "recibida", "received_at": now_iso()}})
    return {"ok": True}


# ----------------- Documento Soporte (simulado) -----------------
@api_router.post("/support-docs")
async def create_support_doc(payload: dict):
    items = payload.get("items", [])
    doc = {"id": str(uuid.uuid4()), "number": await _next_number("support_docs", "DS"),
           "supplier_name": payload.get("supplier_name"), "supplier_doc": payload.get("supplier_doc"),
           "items": items, "total": round(sum(float(i.get("qty", 0)) * float(i.get("price", 0)) for i in items), 2),
           "status": "simulada", "created_at": now_iso()}
    doc["cude"] = hashlib.sha256(f"DS{doc['number']}{doc['total']}".encode()).hexdigest()
    await db.support_docs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/support-docs")
async def list_support_docs():
    return await db.support_docs.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


# ----------------- Nómina Electrónica (simulada) -----------------
@api_router.post("/payroll")
async def create_payslip(payload: dict):
    salary = float(payload.get("salary", 0))
    bonuses = float(payload.get("bonuses", 0))
    deductions = float(payload.get("deductions", 0)) or round((salary + bonuses) * 0.08, 2)  # salud+pensión 8%
    doc = {"id": str(uuid.uuid4()), "number": await _next_number("payroll", "NOM"),
           "employee_name": payload.get("employee_name"), "period": payload.get("period"),
           "salary": salary, "bonuses": bonuses, "deductions": deductions,
           "net": round(salary + bonuses - deductions, 2), "status": "simulada", "created_at": now_iso()}
    if not doc["employee_name"]:
        raise HTTPException(status_code=400, detail="Empleado requerido")
    await db.payroll.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/payroll")
async def list_payroll():
    return await db.payroll.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)


# ----------------- RADIAN (simulado) -----------------
@api_router.get("/radian/invoices")
async def radian_invoices():
    return await db.sales.find({"cufe": {"$exists": True}}, {"_id": 0, "id": 1, "number": 1, "electronic_number": 1,
                                                              "cufe": 1, "total": 1, "created_at": 1, "electronic_status": 1}).to_list(300)


# ----------------- Certificado Digital (metadata) -----------------
@api_router.post("/electronic/certificate")
async def upload_certificate(payload: dict, admin: dict = Depends(require_admin)):
    cert = {"filename": payload.get("filename"), "size": payload.get("size"),
            "expires": payload.get("expires"), "uploaded_by": admin.get("email"), "uploaded_at": now_iso()}
    if not cert["filename"]:
        raise HTTPException(status_code=400, detail="Archivo requerido")
    await db.settings.update_one({"key": "certificate"}, {"$set": {"key": "certificate", "value": cert}}, upsert=True)
    return cert


@api_router.get("/electronic/certificate")
async def get_certificate():
    doc = await db.settings.find_one({"key": "certificate"}, {"_id": 0})
    return (doc or {}).get("value") or {}


# ----------------- Comisiones -----------------
@api_router.post("/commissions/rules")
async def create_commission_rule(payload: dict, admin: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "user_name": payload.get("user_name"), "percent": float(payload.get("percent", 0)),
           "active": True, "created_at": now_iso()}
    if not doc["user_name"]:
        raise HTTPException(status_code=400, detail="Vendedor requerido")
    await db.commission_rules.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/commissions/rules")
async def list_commission_rules():
    return await db.commission_rules.find({}, {"_id": 0}).to_list(100)


@api_router.delete("/commissions/rules/{rid}")
async def delete_commission_rule(rid: str, admin: dict = Depends(require_admin)):
    await db.commission_rules.delete_one({"id": rid})
    return {"ok": True}


@api_router.get("/commissions/report")
async def commissions_report():
    rules = await db.commission_rules.find({"active": True}, {"_id": 0}).to_list(100)
    sales = await db.sales.find({}, {"_id": 0, "cashier": 1, "total": 1}).to_list(5000)
    by_seller = {}
    for s in sales:
        name = s.get("cashier") or "Cajero"
        by_seller[name] = by_seller.get(name, 0) + float(s.get("total", 0))
    return [{"user_name": r["user_name"], "percent": r["percent"],
             "sales_total": round(by_seller.get(r["user_name"], 0), 2),
             "commission": round(by_seller.get(r["user_name"], 0) * r["percent"] / 100, 2)} for r in rules]


# ----------------- Users & Roles (admin) -----------------
class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "cajero"  # admin | cajero


@api_router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)


@api_router.post("/users")
async def create_user(payload: UserCreate, admin: dict = Depends(require_admin)):
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="El correo ya está registrado")
    user = {
        "id": str(uuid.uuid4()), "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name, "role": payload.role if payload.role in ("admin", "cajero") else "cajero",
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    return {k: v for k, v in user.items() if k != "password_hash" and k != "_id"}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="No puedes eliminarte a ti mismo")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return {"ok": True}


# ----------------- General settings (personalización) -----------------
class GeneralSettings(BaseModel):
    store_name: str = "JRPOS"
    ticket_footer: str = "¡Gracias por su compra!"
    iva_default: float = 19
    printer_width: int = 58  # 58 | 80 mm
    accent: str = "emerald"  # emerald | ocean | terracotta | berry | slate
    support_phone: str = ""


@api_router.get("/settings/general")
async def get_general_settings():
    doc = await db.settings.find_one({"key": "general"}, {"_id": 0})
    base = GeneralSettings().model_dump()
    if doc:
        base.update(doc.get("value") or {})
    return base


@api_router.put("/settings/general")
async def save_general_settings(payload: GeneralSettings, admin: dict = Depends(require_admin)):
    if payload.printer_width not in (58, 80):
        raise HTTPException(status_code=400, detail="Ancho de impresora debe ser 58 u 80")
    await db.settings.update_one(
        {"key": "general"},
        {"$set": {"key": "general", "value": payload.model_dump()}},
        upsert=True,
    )
    return {"ok": True}


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
    return {"message": "JRPOS API", "status": "ok"}


app.include_router(auth_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
