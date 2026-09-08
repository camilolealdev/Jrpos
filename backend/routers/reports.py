from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Product, Sale, SaleItem, User

reports_router = APIRouter(prefix="/api", tags=["reports"])

LOW_STOCK_THRESHOLD = 5


class ProductBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    barcode: Optional[str] = None
    sku: Optional[str] = None
    category: str = "General"
    price: float = 0.0
    cost: float = 0.0
    stock: float = 0.0
    unit: str = "und"
    tax_rate: float = 19.0
    supplier_id: Optional[str] = None
    image_url: Optional[str] = None
    is_service: bool = False
    created_at: datetime
    updated_at: datetime


class TopProductOut(BaseModel):
    name: str
    qty: float


class DailySaleOut(BaseModel):
    date: str
    total: float


class ReportSummaryOut(BaseModel):
    total_sales: float
    sales_count: int
    products_count: int
    low_stock_count: int
    todays_sales: float
    todays_count: int
    total_cogs: float = 0.0
    gross_profit: float = 0.0
    gross_margin_percent: float = 0.0
    top_products: List[TopProductOut]
    daily_sales: List[DailySaleOut]
    low_stock: List[ProductBrief]


@reports_router.get("/reports/summary", response_model=ReportSummaryOut)
async def report_summary(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    from redis_client import get_json, set_json

    cached = await get_json("reports:summary")
    if cached is not None:
        return cached

    total_sales = (await session.execute(select(func.coalesce(func.sum(Sale.total), 0.0)))).scalar_one()
    sales_count = (await session.execute(select(func.count()).select_from(Sale))).scalar_one()
    products_count = (await session.execute(select(func.count()).select_from(Product))).scalar_one()
    low_stock_count = (
        await session.execute(
            select(func.count()).select_from(Product).where(Product.stock <= LOW_STOCK_THRESHOLD)
        )
    ).scalar_one()

    # Calculate COGS from SaleItems joined with Product costs
    cogs_query = (
        select(func.coalesce(func.sum(SaleItem.qty * Product.cost), 0.0))
        .select_from(SaleItem)
        .join(Product, SaleItem.product_id == Product.id, isouter=True)
    )
    total_cogs_val = float((await session.execute(cogs_query)).scalar_one() or 0.0)
    gross_profit_val = max(0.0, float(total_sales) - total_cogs_val)
    margin_pct = round((gross_profit_val / float(total_sales) * 100), 1) if total_sales > 0 else 0.0

    # Today's sales (UTC day boundaries)
    now = datetime.now(timezone.utc)
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    todays_total, todays_count = (
        await session.execute(
            select(func.coalesce(func.sum(Sale.total), 0.0), func.count()).where(
                Sale.created_at >= today_start, Sale.created_at < today_end
            )
        )
    ).one()

    # Top products by quantity sold
    top_rows = (
        await session.execute(
            select(SaleItem.name, func.sum(SaleItem.qty).label("qty"))
            .group_by(SaleItem.name)
            .order_by(func.sum(SaleItem.qty).desc())
            .limit(5)
        )
    ).all()
    top_products = [{"name": name, "qty": float(qty)} for name, qty in top_rows]

    # Last 7 days that actually had sales (mirrors original: group all-time by day, take last 7 ascending)
    day_expr = func.date_trunc("day", Sale.created_at)
    daily_rows = (
        await session.execute(
            select(day_expr.label("day"), func.sum(Sale.total).label("total"))
            .group_by(day_expr)
            .order_by(day_expr.desc())
            .limit(7)
        )
    ).all()
    daily_rows = list(reversed(daily_rows))
    daily_sales = [{"date": day.date().isoformat(), "total": round(float(total), 2)} for day, total in daily_rows]

    low_stock_rows = (
        await session.execute(
            select(Product).where(Product.stock <= LOW_STOCK_THRESHOLD).limit(10)
        )
    ).scalars().all()

    result = {
        "total_sales": round(float(total_sales), 2),
        "sales_count": sales_count,
        "products_count": products_count,
        "low_stock_count": low_stock_count,
        "todays_sales": round(float(todays_total), 2),
        "todays_count": todays_count,
        "total_cogs": round(total_cogs_val, 2),
        "gross_profit": round(gross_profit_val, 2),
        "gross_margin_percent": margin_pct,
        "top_products": top_products,
        "daily_sales": daily_sales,
        "low_stock": [
            ProductBrief.model_validate(p).model_dump(mode="json") for p in low_stock_rows
        ],
    }
    await set_json("reports:summary", result, ttl=30)
    return result


@reports_router.get("/reports/accounting-export")
async def accounting_export(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Sale).order_by(Sale.created_at.desc())
    if start_date:
        try:
            s_dt = datetime.fromisoformat(start_date)
            stmt = stmt.where(Sale.created_at >= s_dt)
        except Exception:
            pass
    if end_date:
        try:
            e_dt = datetime.fromisoformat(end_date)
            stmt = stmt.where(Sale.created_at <= e_dt)
        except Exception:
            pass

    sales = (await session.execute(stmt.limit(1000))).scalars().all()

    rows = []
    for s in sales:
        items_stmt = select(SaleItem).where(SaleItem.sale_id == s.id)
        items = (await session.execute(items_stmt)).scalars().all()
        items_desc = ", ".join(f"{it.name} (x{it.qty})" for it in items)
        
        # Calculate approximate taxes by rate
        tax_0 = sum(it.qty * it.price for it in items if it.tax_rate == 0)
        tax_5 = sum(it.qty * it.price * 0.05 for it in items if it.tax_rate == 5)
        tax_19 = sum(it.qty * it.price * 0.19 for it in items if it.tax_rate == 19)

        rows.append({
            "sale_id": s.id,
            "number": s.number,
            "date": s.created_at.isoformat() if s.created_at else "",
            "customer_name": s.customer_name or "Cliente General",
            "cashier": s.cashier or "Cajero",
            "payment_method": s.payment_method,
            "subtotal": s.subtotal,
            "tax_total": s.tax_total,
            "tax_0": round(tax_0, 2),
            "tax_5": round(tax_5, 2),
            "tax_19": round(tax_19, 2),
            "discount": s.discount,
            "total": s.total,
            "items_count": len(items),
            "items_summary": items_desc,
        })

    return {
        "count": len(rows),
        "total_amount": round(sum(r["total"] for r in rows), 2),
        "total_tax": round(sum(r["tax_total"] for r in rows), 2),
        "sales": rows,
    }
