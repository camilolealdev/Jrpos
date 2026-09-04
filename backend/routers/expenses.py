from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Expense, User

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
    user: User = Depends(get_current_user),
):
    e = Expense(**payload.model_dump())
    session.add(e)
    await session.commit()
    await session.refresh(e)
    return e


@expenses_router.get("/expenses")
async def list_expenses(
    limit: int = 300,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Expense).order_by(Expense.created_at.desc()).limit(limit)
    expenses = (await session.execute(stmt)).scalars().all()

    # Los agregados se calculan sobre TODA la tabla (no solo la página
    # devuelta por `limit`), a diferencia del original en Mongo que sumaba
    # únicamente sobre los últimos `limit` documentos por prefijo de string
    # ISO — aquí se hace correctamente con agregados SQL sobre fecha real,
    # manteniendo la misma forma de respuesta que consume Expenses.jsx.
    total = (await session.execute(select(func.coalesce(func.sum(Expense.amount), 0.0)))).scalar_one()
    today_total = (await session.execute(
        select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
            func.date(Expense.created_at) == func.current_date()
        )
    )).scalar_one()
    month_total = (await session.execute(
        select(func.coalesce(func.sum(Expense.amount), 0.0)).where(
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
    user: User = Depends(get_current_user),
):
    e = await session.get(Expense, expense_id)
    if not e:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    await session.delete(e)
    await session.commit()
    return {"ok": True}
