from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Document, DocumentItem, Product, Sale, SaleItem, StockMovement, User
from routers.sales import SaleOut, _sale_out

docs_router = APIRouter(prefix="/api", tags=["docs"])


# ----------------- Documentos de venta genéricos (cotizaciones, remisiones, cuentas cobro) -----------------
# kind -> (prefix, initial status). Mirrors DOC_CFG from the original server.py.
DOC_CFG: dict = {
    "quotes": ("COT", "borrador"),
    "remissions": ("REM", "pendiente"),
    "collection_accounts": ("CC", "pendiente"),
}


def _cfg(kind: str) -> tuple:
    cfg = DOC_CFG.get(kind)
    if not cfg:
        raise HTTPException(status_code=404, detail="Tipo inválido")
    return cfg


# ----------------- Schemas -----------------
class DocumentItemIn(BaseModel):
    product_id: Optional[str] = None
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    cost: Optional[float] = None
    tax_rate: float = 19.0


class DocumentItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: Optional[str] = None
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    cost: Optional[float] = None
    tax_rate: Optional[float] = None


class DocumentCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    concept: Optional[str] = None
    items: List[DocumentItemIn] = []
    amount: Optional[float] = None
    notes: Optional[str] = None


class DocumentStatusUpdate(BaseModel):
    status: str


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    kind: str
    number: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    concept: Optional[str] = None
    items: List[DocumentItemOut] = []
    total: float
    status: str
    notes: Optional[str] = None
    sale_id: Optional[str] = None
    created_at: datetime


def _doc_out(doc: Document, items: List[DocumentItem]) -> DocumentOut:
    return DocumentOut(
        id=doc.id, kind=doc.kind, number=doc.number, customer_id=doc.customer_id,
        customer_name=doc.customer_name, concept=doc.concept,
        items=[DocumentItemOut.model_validate(i) for i in items],
        total=doc.total, status=doc.status, notes=doc.notes, sale_id=doc.sale_id,
        created_at=doc.created_at,
    )


# ----------------- Endpoints -----------------
@docs_router.get("/docs/{kind}", response_model=List[DocumentOut])
async def list_docs(
    kind: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _cfg(kind)
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = (
        select(Document)
        .where(Document.kind == kind, Document.tenant_id == tenant_id)
        .order_by(Document.created_at.desc())
        .limit(300)
    )
    docs = (await session.execute(stmt)).scalars().all()
    if not docs:
        return []

    doc_ids = [d.id for d in docs]
    items_stmt = select(DocumentItem).where(DocumentItem.document_id.in_(doc_ids))
    all_items = (await session.execute(items_stmt)).scalars().all()
    items_by_doc: dict = {}
    for it in all_items:
        items_by_doc.setdefault(it.document_id, []).append(it)

    return [_doc_out(d, items_by_doc.get(d.id, [])) for d in docs]


@docs_router.post("/docs/{kind}", response_model=DocumentOut)
async def create_doc(
    kind: str,
    payload: DocumentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    prefix, initial_status = _cfg(kind)
    tenant_id = user.tenant_id or "tenant-default-001"

    total = round(sum(i.qty * i.price for i in payload.items), 2)
    if kind == "collection_accounts" and payload.amount:
        total = round(float(payload.amount), 2)

    seq = (await session.execute(text("SELECT nextval('documents_number_seq')"))).scalar_one()
    number = f"{prefix}-{seq:06d}"

    doc = Document(
        kind=kind, number=number, customer_id=payload.customer_id, customer_name=payload.customer_name,
        concept=payload.concept, total=total, status=initial_status, notes=payload.notes,
        tenant_id=tenant_id,
    )
    session.add(doc)
    await session.flush()  # assigns doc.id

    doc_items: List[DocumentItem] = []
    for i in payload.items:
        di = DocumentItem(
            document_id=doc.id, product_id=i.product_id, name=i.name, barcode=i.barcode,
            qty=i.qty, price=i.price, cost=i.cost, tax_rate=i.tax_rate, tenant_id=tenant_id,
        )
        session.add(di)
        doc_items.append(di)

    await session.commit()
    return _doc_out(doc, doc_items)


@docs_router.put("/docs/{kind}/{doc_id}", response_model=DocumentOut)
async def update_doc_status(
    kind: str,
    doc_id: str,
    payload: DocumentStatusUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _cfg(kind)
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Document).where(Document.id == doc_id, Document.kind == kind, Document.tenant_id == tenant_id)
    doc = (await session.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")

    items_stmt = select(DocumentItem).where(DocumentItem.document_id == doc.id)
    items = (await session.execute(items_stmt)).scalars().all()

    doc.status = payload.status
    await session.commit()
    return _doc_out(doc, items)


@docs_router.post("/docs/{kind}/{doc_id}/convert", response_model=SaleOut)
async def convert_doc_to_sale(
    kind: str,
    doc_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if kind not in DOC_CFG or kind == "collection_accounts":
        raise HTTPException(status_code=400, detail="Este documento no se convierte a venta")

    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Document).where(Document.id == doc_id, Document.kind == kind, Document.tenant_id == tenant_id)
    doc = (await session.execute(stmt)).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")
    if doc.status == "convertida":
        raise HTTPException(status_code=400, detail="Ya fue convertida")

    items_stmt = select(DocumentItem).where(DocumentItem.document_id == doc.id)
    doc_items = (await session.execute(items_stmt)).scalars().all()

    sale_items: List[SaleItem] = []
    for i in doc_items:
        tax_rate = i.tax_rate if i.tax_rate is not None else 19.0
        subtotal = round(i.qty * i.price, 2)
        sale_items.append(SaleItem(
            sale_id="",  # set after sale.id is known
            product_id=i.product_id or "manual", name=i.name, barcode=i.barcode,
            qty=i.qty, price=i.price, tax_rate=tax_rate, subtotal=subtotal, tenant_id=tenant_id,
        ))

    subtotal_total = sum(it.subtotal for it in sale_items)
    tax_total = round(sum(it.subtotal * (it.tax_rate / 100.0) / (1 + it.tax_rate / 100.0) for it in sale_items), 2)

    seq = (await session.execute(text("SELECT nextval('sales_number_seq')"))).scalar_one()
    number = f"POS-{seq:06d}"

    sale = Sale(
        tenant_id=tenant_id,
        number=number, subtotal=round(subtotal_total, 2), tax_total=tax_total, discount=0.0,
        total=round(subtotal_total, 2), payment_method="efectivo", customer_id=doc.customer_id,
        customer_name=doc.customer_name, cashier=user.name, notes=f"Desde {doc.number}",
        is_credit=False, balance_due=0.0, credit_status="paid",
    )
    session.add(sale)
    await session.flush()  # assigns sale.id

    for it in sale_items:
        it.sale_id = sale.id
        session.add(it)

    # Decrease stock in the SAME transaction as the sale (servicios no descuentan inventario)
    for it in sale_items:
        if it.product_id and it.product_id != "manual":
            product = await session.get(Product, it.product_id)
            if product and not product.is_service:
                previous_stock = float(product.stock)
                new_stock = previous_stock - it.qty
                await session.execute(
                    update(Product).where(Product.id == it.product_id).values(stock=Product.stock - it.qty)
                )
                session.add(StockMovement(
                    tenant_id=tenant_id, product_id=it.product_id, type="sale", qty=-it.qty,
                    previous_stock=previous_stock, new_stock=new_stock, user_id=user.id,
                    reason=f"Venta {number} (desde {doc.number})",
                ))

    doc.status = "convertida"
    doc.sale_id = sale.id

    await session.commit()
    return await _sale_out(session, sale)
