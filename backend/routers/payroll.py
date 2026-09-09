from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Payroll, User

payroll_router = APIRouter(prefix="/api", tags=["payroll"])


class PayrollCreate(BaseModel):
    employee_name: Optional[str] = None
    period: Optional[str] = None
    salary: float = 0.0
    bonuses: float = 0.0
    deductions: Optional[float] = None


class PayrollOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    employee_name: str
    period: Optional[str] = None
    salary: float
    bonuses: float
    deductions: float
    net: float
    status: str
    created_at: datetime


# ----------------- Nómina Electrónica (simulada) -----------------
@payroll_router.post("/payroll", response_model=PayrollOut)
async def create_payslip(
    payload: PayrollCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not payload.employee_name:
        raise HTTPException(status_code=400, detail="Empleado requerido")

    tenant_id = user.tenant_id or "tenant-default-001"
    salary = float(payload.salary or 0)
    bonuses = float(payload.bonuses or 0)
    # salud+pensión 8% by default when not explicitly provided
    deductions = float(payload.deductions or 0) or round((salary + bonuses) * 0.08, 2)
    net = round(salary + bonuses - deductions, 2)

    seq = (await session.execute(text("SELECT nextval('payroll_number_seq')"))).scalar_one()
    number = f"NOM-{seq:06d}"

    doc = Payroll(
        number=number, employee_name=payload.employee_name, period=payload.period,
        salary=salary, bonuses=bonuses, deductions=deductions, net=net, status="simulada",
        tenant_id=tenant_id,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


@payroll_router.get("/payroll", response_model=List[PayrollOut])
async def list_payroll(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(Payroll).where(Payroll.tenant_id == tenant_id).order_by(Payroll.created_at.desc()).limit(300)
    res = await session.execute(stmt)
    return res.scalars().all()
