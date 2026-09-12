from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Expense, User
from permissions import require_permission

expenses_router = APIRouter(prefix="/api", tags=["expenses"])


# ----------------- Schemas -----------------
class ExpenseCreate(BaseModel):
    concept: str
    category: str = "General"
    amount: float
    method: str = "efectivo"
    supplier_id: Optional[str] = None
    notes: Optional[str] = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tenant_id: Optional[str] = None
    concept: str
    category: str = "General"
    amount: float
    method: str = "efectivo"
    supplier_id: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


# ----------------- Endpoints -----------------
@expenses_router.post("/expenses", response_model=ExpenseOut)
async def create_expense(
    payload: ExpenseCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("expenses:create")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    e = Expense(tenant_id=tenant_id, **payload.model_dump())
    session.add(e)
    await session.commit()
    return e


@expenses_router.get("/expenses")
async def list_expenses(
    limit: int = 300,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("expenses:read")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Expense).where(Expense.tenant_id == tenant_id).order_by(Expense.created_at.desc()).limit(limit)
    expenses = (await session.execute(stmt)).scalars().all()

    total = (await session.execute(
        select(func.coalesce(func.sum(Expense.amount), 0.0)).where(Expense.tenant_id == tenant_id)
    )).scalar_one()
    today_total = (await session.execute(
        select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
            Expense.tenant_id == tenant_id,
            func.date(Expense.created_at) == func.current_date()
        )
    )).scalar_one()
    month_total = (await session.execute(
        select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
            Expense.tenant_id == tenant_id,
            func.date_trunc("month", Expense.created_at) == func.date_trunc("month", func.now())
        )
    )).scalar_one()

    return {
        "expenses": [ExpenseOut.model_validate(e) for e in expenses],
        "total": round(float(total), 2),
        "today": round(float(today_total), 2),
        "month": round(float(month_total), 2),
    }


@expenses_router.delete("/expenses/{expense_id}")
async def delete_expense(
    expense_id: str,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("expenses:delete")),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Expense).where(Expense.id == expense_id, Expense.tenant_id == tenant_id)
    e = (await session.execute(stmt)).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    await session.delete(e)
    await session.commit()
    return {"ok": True}

