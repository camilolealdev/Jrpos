from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Contact, Payment, Product, Sale, SaleItem, User

sales_router = APIRouter(prefix="/api", tags=["sales"])


class SaleItemIn(BaseModel):
    product_id: str
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    tax_rate: float = 19.0
    subtotal: Optional[float] = None


class SaleItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: str
    name: str
    barcode: Optional[str] = None
    qty: float
    price: float
    tax_rate: float = 19.0
    subtotal: Optional[float] = None


class SaleCreate(BaseModel):
    items: List[SaleItemIn]
    discount: float = 0.0
    payment_method: str = "efectivo"
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    notes: Optional[str] = None


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    items: List[SaleItemOut]
    subtotal: float
    tax_total: float
    discount: float
    total: float
    payment_method: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    cashier: Optional[str] = "Cajero"
    notes: Optional[str] = None
    is_credit: bool
    balance_due: float
    credit_status: str
    created_at: datetime


class PaymentCreate(BaseModel):
    sale_id: str
    amount: float
    method: str = "efectivo"
    notes: Optional[str] = None


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    sale_id: str
    sale_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    amount: float
    method: str
    notes: Optional[str] = None
    created_at: datetime


async def _sale_out(session: AsyncSession, sale: Sale) -> SaleOut:
    items = (await session.execute(select(SaleItem).where(SaleItem.sale_id == sale.id))).scalars().all()
    return SaleOut(
        id=sale.id, number=sale.number, items=items, subtotal=sale.subtotal, tax_total=sale.tax_total,
        discount=sale.discount, total=sale.total, payment_method=sale.payment_method,
        customer_id=sale.customer_id, customer_name=sale.customer_name, cashier=sale.cashier,
        notes=sale.notes, is_credit=sale.is_credit, balance_due=sale.balance_due,
        credit_status=sale.credit_status, created_at=sale.created_at,
    )


@sales_router.post("/sales", response_model=SaleOut)
async def create_sale(
    payload: SaleCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    # Recalculate totals server-side for integrity
    items: List[SaleItem] = []
    subtotal = 0.0
    tax_total = 0.0
    for it in payload.items:
        line_sub = round(it.qty * it.price, 2)
        line_tax = round(line_sub * (it.tax_rate / 100.0) / (1 + it.tax_rate / 100.0), 2) if it.tax_rate else 0.0
        items.append(SaleItem(
            sale_id="",  # set after sale.id is known
            product_id=it.product_id, name=it.name, barcode=it.barcode,
            qty=it.qty, price=it.price, tax_rate=it.tax_rate, subtotal=line_sub,
        ))
        subtotal += line_sub
        tax_total += line_tax

    discount = payload.discount or 0.0
    total = round(subtotal - discount, 2)
    is_credit = payload.payment_method == "credito"
    if is_credit and not payload.customer_id:
        raise HTTPException(status_code=400, detail="Debes seleccionar un cliente para venta a crédito (fiado)")

    # Atomic sequence — avoids the race condition of the old count()+1 scheme
    seq = (await session.execute(text("SELECT nextval('sales_number_seq')"))).scalar_one()
    number = f"POS-{seq:06d}"

    sale = Sale(
        number=number, subtotal=round(subtotal, 2), tax_total=round(tax_total, 2),
        discount=round(discount, 2), total=total, payment_method=payload.payment_method,
        customer_id=payload.customer_id, customer_name=payload.customer_name,
        cashier=user.name, notes=payload.notes, is_credit=is_credit,
        balance_due=total if is_credit else 0.0, credit_status="pending" if is_credit else "paid",
    )
    session.add(sale)
    await session.flush()  # assigns sale.id

    for it in items:
        it.sale_id = sale.id
        session.add(it)

    # Decrease stock in the SAME transaction as the sale (servicios no descuentan inventario)
    for it in items:
        product = await session.get(Product, it.product_id)
        if product and not product.is_service:
            await session.execute(
                update(Product).where(Product.id == it.product_id).values(stock=Product.stock - it.qty)
            )

    await session.commit()
    return await _sale_out(session, sale)


@sales_router.get("/sales", response_model=List[SaleOut])
async def list_sales(
    limit: int = 100,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Sale).order_by(Sale.created_at.desc()).limit(limit)
    sales = (await session.execute(stmt)).scalars().all()
    return [await _sale_out(session, s) for s in sales]


@sales_router.get("/sales/{sale_id}", response_model=SaleOut)
async def get_sale(
    sale_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    sale = await session.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return await _sale_out(session, sale)


# ----------------- Credits / Fiado -----------------
class ContactBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    kind: str
    name: str
    document: Optional[str] = None
    document_type: Optional[str] = "CC"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


@sales_router.post("/credits/payment", response_model=PaymentOut)
async def register_payment(
    payload: PaymentCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    sale = await session.get(Sale, payload.sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if not sale.is_credit:
        raise HTTPException(status_code=400, detail="Esta venta no es a crédito")
    current_balance = float(sale.balance_due)
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="El abono debe ser mayor a 0")
    if amount > current_balance + 0.01:
        raise HTTPException(status_code=400, detail=f"El abono supera el saldo pendiente ({current_balance})")

    new_balance = round(current_balance - amount, 2)
    sale.balance_due = new_balance
    sale.credit_status = "paid" if new_balance <= 0.009 else "partial"

    pay = Payment(
        sale_id=payload.sale_id, sale_number=sale.number, customer_id=sale.customer_id,
        customer_name=sale.customer_name, amount=round(amount, 2), method=payload.method, notes=payload.notes,
    )
    session.add(pay)
    await session.commit()
    await session.refresh(pay)
    return pay


@sales_router.get("/credits/summary")
async def credits_summary(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Sale).where(Sale.is_credit == True, Sale.credit_status.in_(["pending", "partial"]))  # noqa: E712
    sales = (await session.execute(stmt)).scalars().all()
    by_customer: dict = {}
    for s in sales:
        key = s.customer_id or "sin_id"
        entry = by_customer.setdefault(key, {
            "customer_id": s.customer_id, "customer_name": s.customer_name or "Sin cliente",
            "total_due": 0.0, "sales_count": 0, "oldest_date": s.created_at,
        })
        entry["total_due"] += float(s.balance_due)
        entry["sales_count"] += 1
        if s.created_at and s.created_at < entry["oldest_date"]:
            entry["oldest_date"] = s.created_at
    result = sorted(by_customer.values(), key=lambda x: x["total_due"], reverse=True)
    total = sum(x["total_due"] for x in result)
    return {"customers": result, "total_due": round(total, 2)}


@sales_router.get("/credits/customer/{customer_id}")
async def credit_statement(
    customer_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    contact = await session.get(Contact, customer_id)
    sales_stmt = select(Sale).where(Sale.customer_id == customer_id, Sale.is_credit == True).order_by(Sale.created_at.desc())  # noqa: E712
    sales = (await session.execute(sales_stmt)).scalars().all()
    payments_stmt = select(Payment).where(Payment.customer_id == customer_id).order_by(Payment.created_at.desc())
    payments = (await session.execute(payments_stmt)).scalars().all()
    total_credit = sum(float(s.total) for s in sales)
    total_paid = sum(float(p.amount) for p in payments)
    balance = round(total_credit - total_paid, 2)
    return {
        "customer": ContactBrief.model_validate(contact) if contact else None,
        "sales": [await _sale_out(session, s) for s in sales],
        "payments": payments,
        "total_credit": round(total_credit, 2),
        "total_paid": round(total_paid, 2),
        "balance": balance,
    }


@sales_router.get("/credits/pending-sales")
async def pending_credit_sales(
    customer_id: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Sale).where(Sale.is_credit == True, Sale.credit_status.in_(["pending", "partial"]))  # noqa: E712
    if customer_id:
        stmt = stmt.where(Sale.customer_id == customer_id)
    stmt = stmt.order_by(Sale.created_at.desc())
    sales = (await session.execute(stmt)).scalars().all()
    return [await _sale_out(session, s) for s in sales]
