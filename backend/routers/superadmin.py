from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_superadmin
from db import get_session
from models_sql import PlatformPlan, Sale, Tenant, TenantSubscription, User, utcnow

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])


class ExtendTrialRequest(BaseModel):
    days: int = 15


class UpdateStatusRequest(BaseModel):
    status: str  # trial | active | suspended | expired


@router.get("/stats")
async def get_platform_stats(admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    total_tenants = (await session.execute(select(func.count(Tenant.id)))).scalar() or 0
    active_tenants = (await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "active"))).scalar() or 0
    trial_tenants = (await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "trial"))).scalar() or 0
    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    total_sales_count = (await session.execute(select(func.count(Sale.id)))).scalar() or 0
    total_sales_volume = (await session.execute(select(func.sum(Sale.total)))).scalar() or 0.0

    # Estimado de MRR
    subscriptions = (await session.execute(
        select(TenantSubscription).where(TenantSubscription.status.in_(["active", "trial"]))
    )).scalars().all()

    estimated_mrr = sum(s.amount_cop for s in subscriptions if s.status == "active")

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "trial_tenants": trial_tenants,
        "total_users": total_users,
        "total_sales_count": total_sales_count,
        "total_sales_volume_cop": round(total_sales_volume, 2),
        "estimated_mrr_cop": round(estimated_mrr, 2),
    }


@router.get("/tenants")
async def list_tenants(admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    tenants = (await session.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars().all()
    now = utcnow()

    result = []
    for t in tenants:
        days_left = max(0, (t.trial_ends_at - now).days) if t.trial_ends_at else 0
        users_count = (await session.execute(select(func.count(User.id)).where(User.tenant_id == t.id))).scalar() or 0
        sales_count = (await session.execute(select(func.count(Sale.id)).where(Sale.tenant_id == t.id))).scalar() or 0
        sales_volume = (await session.execute(select(func.sum(Sale.total)).where(Sale.tenant_id == t.id))).scalar() or 0.0

        result.append({
            "id": t.id,
            "slug": t.slug,
            "business_name": t.business_name,
            "email": t.email,
            "phone": t.phone,
            "business_type": t.business_type,
            "status": t.status,
            "trial_ends_at": t.trial_ends_at.isoformat() if t.trial_ends_at else None,
            "days_left": days_left,
            "users_count": users_count,
            "sales_count": sales_count,
            "sales_volume_cop": round(sales_volume, 2),
            "created_at": t.created_at.isoformat() if t.created_at else None,
        })

    return result


@router.post("/tenants/{tenant_id}/extend-trial")
async def extend_tenant_trial(tenant_id: str, payload: ExtendTrialRequest, admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Inquilino no encontrado")

    now = utcnow()
    base_time = tenant.trial_ends_at if (tenant.trial_ends_at and tenant.trial_ends_at > now) else now
    tenant.trial_ends_at = base_time + timedelta(days=payload.days)
    tenant.status = "trial"
    tenant.updated_at = now

    await session.commit()
    return {
        "ok": True,
        "tenant_id": tenant.id,
        "trial_ends_at": tenant.trial_ends_at.isoformat(),
        "days_added": payload.days,
    }


@router.post("/tenants/{tenant_id}/status")
async def update_tenant_status(tenant_id: str, payload: UpdateStatusRequest, admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Inquilino no encontrado")

    if payload.status not in ("trial", "active", "suspended", "expired"):
        raise HTTPException(status_code=400, detail="Estado de suscripción inválido")

    tenant.status = payload.status
    tenant.updated_at = utcnow()
    await session.commit()
    return {"ok": True, "tenant_id": tenant.id, "status": tenant.status}
