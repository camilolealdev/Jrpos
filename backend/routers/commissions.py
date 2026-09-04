from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_session
from models_sql import CommissionRule, Sale, User

commissions_router = APIRouter(prefix="/api", tags=["commissions"])


class CommissionRuleCreate(BaseModel):
    user_name: str
    percent: float = 0.0


class CommissionRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_name: str
    percent: float
    active: bool
    created_at: datetime


class CommissionReportRow(BaseModel):
    user_name: str
    percent: float
    sales_total: float
    commission: float


# ----------------- Comisiones -----------------
@commissions_router.post("/commissions/rules", response_model=CommissionRuleOut)
async def create_commission_rule(
    payload: CommissionRuleCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if not payload.user_name:
        raise HTTPException(status_code=400, detail="Vendedor requerido")
    rule = CommissionRule(user_name=payload.user_name, percent=float(payload.percent or 0), active=True)
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    return rule


@commissions_router.get("/commissions/rules", response_model=List[CommissionRuleOut])
async def list_commission_rules(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(CommissionRule).limit(100)
    res = await session.execute(stmt)
    return res.scalars().all()


@commissions_router.delete("/commissions/rules/{rid}")
async def delete_commission_rule(
    rid: str,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    rule = await session.get(CommissionRule, rid)
    if rule:
        await session.delete(rule)
        await session.commit()
    return {"ok": True}


@commissions_router.get("/commissions/report", response_model=List[CommissionReportRow])
async def commissions_report(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rules = (
        await session.execute(select(CommissionRule).where(CommissionRule.active == True))  # noqa: E712
    ).scalars().all()
    sales = (await session.execute(select(Sale.cashier, Sale.total))).all()

    # NOTE (known data-quality issue, ported as-is from the original): commissions
    # are matched against sales by the CASHIER NAME STRING (Sale.cashier), not a
    # real foreign key to users. Renaming a user breaks historical attribution.
    by_seller: dict = {}
    for cashier, total in sales:
        name = cashier or "Cajero"
        by_seller[name] = by_seller.get(name, 0.0) + float(total or 0)

    return [
        CommissionReportRow(
            user_name=r.user_name,
            percent=r.percent,
            sales_total=round(by_seller.get(r.user_name, 0.0), 2),
            commission=round(by_seller.get(r.user_name, 0.0) * r.percent / 100, 2),
        )
        for r in rules
    ]
