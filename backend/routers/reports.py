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
    top_products: List[TopProductOut]
    daily_sales: List[DailySaleOut]
    low_stock: List[ProductBrief]


@reports_router.get("/reports/summary", response_model=ReportSummaryOut)
async def report_summary(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    total_sales = (await session.execute(select(func.coalesce(func.sum(Sale.total), 0.0)))).scalar_one()
    sales_count = (await session.execute(select(func.count()).select_from(Sale))).scalar_one()
    products_count = (await session.execute(select(func.count()).select_from(Product))).scalar_one()
    low_stock_count = (
        await session.execute(
            select(func.count()).select_from(Product).where(Product.stock <= LOW_STOCK_THRESHOLD)
        )
    ).scalar_one()

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

    return {
        "total_sales": round(float(total_sales), 2),
        "sales_count": sales_count,
        "products_count": products_count,
        "low_stock_count": low_stock_count,
        "todays_sales": round(float(todays_total), 2),
        "todays_count": todays_count,
        "top_products": top_products,
        "daily_sales": daily_sales,
        "low_stock": low_stock_rows,
    }
