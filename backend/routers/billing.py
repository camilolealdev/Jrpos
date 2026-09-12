from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin, require_superadmin
from db import get_session
from models_sql import PlatformPlan, Tenant, TenantSubscription, TenantAuditLog, User, new_uuid, utcnow

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    plan_id: str
    period: str = "monthly"  # monthly | quarterly | annual
    payment_method: str = "wompi"


class ActivateRequest(BaseModel):
    plan_id: str
    months: int = 1


class PlatformPlanCreate(BaseModel):
    id: str
    name: str
    description: str | None = None
    price_cop: float = 0.0
    price_quarterly_cop: float = 0.0
    price_annual_cop: float = 0.0
    max_branches: int = 1
    max_users: int = 3
    max_products: int = 5000
    ai_ocr_enabled: bool = True
    dian_enabled: bool = False
    is_active: bool = True


@router.get("/status")
async def get_subscription_status(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    tenant_id = user.tenant_id or "tenant-default-001"
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        return {
            "status": "trial",
            "plan": "pro",
            "days_left": 30,
            "is_active": True,
            "trial_ends_at": (utcnow() + timedelta(days=30)).isoformat(),
        }

    now = utcnow()
    days_left = max(0, (tenant.trial_ends_at - now).days) if tenant.trial_ends_at else 0
    is_expired = tenant.status == "expired" or (tenant.status == "trial" and tenant.trial_ends_at and tenant.trial_ends_at < now)

    # Obtener suscripción activa
    sub = (await session.execute(
        select(TenantSubscription).where(TenantSubscription.tenant_id == tenant_id).order_by(TenantSubscription.created_at.desc())
    )).scalars().first()

    plan = await session.get(PlatformPlan, sub.plan_id) if sub else None

    return {
        "tenant_id": tenant.id,
        "business_name": tenant.business_name,
        "status": "expired" if is_expired else tenant.status,
        "days_left": days_left,
        "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        "plan_id": sub.plan_id if sub else "pro",
        "plan_name": plan.name if plan else "Plan Negocio Pro",
        "ai_ocr_enabled": plan.ai_ocr_enabled if plan else True,
        "dian_enabled": plan.dian_enabled if plan else True,
    }


@router.get("/plans")
async def get_platform_plans(session: AsyncSession = Depends(get_session)):
    plans = (await session.execute(select(PlatformPlan).where(PlatformPlan.is_active == True))).scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "price_cop": p.price_cop,
            "price_quarterly_cop": p.price_quarterly_cop,
            "price_annual_cop": p.price_annual_cop,
            "max_branches": p.max_branches,
            "max_users": p.max_users,
            "max_products": p.max_products,
            "ai_ocr_enabled": p.ai_ocr_enabled,
            "dian_enabled": p.dian_enabled,
        }
        for p in plans
    ]


@router.post("/checkout")
async def create_checkout_session(payload: CheckoutRequest, user: User = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    tenant_id = user.tenant_id or "tenant-default-001"
    plan = await session.get(PlatformPlan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    if payload.period == "annual":
        amount = plan.price_annual_cop
    elif payload.period == "quarterly":
        amount = plan.price_quarterly_cop
    else:
        amount = plan.price_cop

    # Simulación lista para webhook de Wompi / PSE / Tarjeta
    return {
        "ok": True,
        "checkout_url": f"https://checkout.wompi.co/p/?public-key=pub_test_jrpos&amount-in-cents={int(amount * 100)}&currency=COP&reference=sub_{tenant_id}_{payload.plan_id}",
        "reference": f"sub_{tenant_id}_{payload.plan_id}",
        "amount_cop": amount,
        "plan_name": plan.name,
    }


# ---------------- Pago de plataforma (QR/transferencia) y activacion ----------------

class ActivateRequest(BaseModel):
    plan_id: str
    months: int = 1


@router.get("/payment-info")
async def payment_info(session: AsyncSession = Depends(get_session)):
    """PUBLICO: info de pago de la plataforma (QR Nequi/Bancolombia, planes).

    Lo consume la pantalla /paywall cuando el trial vencio (el usuario ya no
    puede autenticar endpoints protegidos, por eso esta ruta es abierta).
    """
    plans = (
        (await session.execute(select(PlatformPlan).where(PlatformPlan.is_active == True).order_by(PlatformPlan.price_cop)))  # noqa: E712
        .scalars().all()
    )
    import os
    return {
        "qr_url": os.environ.get("PAYMENT_QR_URL", ""),
        "bank_info": os.environ.get("PAYMENT_BANK_INFO", ""),
        "whatsapp": os.environ.get("PAYMENT_WHATSAPP", ""),
        "nequi_number": os.environ.get("PAYMENT_NEQUI_NUMBER", ""),
        "breb_key": os.environ.get("PAYMENT_BREB_KEY", ""),
        "plans": [
            {
                "id": pl.id, "name": pl.name, "price_cop": pl.price_cop,
                "price_quarterly_cop": pl.price_quarterly_cop,
                "price_annual_cop": pl.price_annual_cop,
                "description": getattr(pl, "description", "") or "",
                "max_users": getattr(pl, "max_users", None),
                "max_products": getattr(pl, "max_products", None),
            }
            for pl in plans
        ],
    }


@router.post("/superadmin/tenants/{tenant_id}/activate")
async def activate_subscription(
    tenant_id: str,
    payload: ActivateRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_superadmin),
):
    """Activa/cobra un tenant: suscripcion activa por N meses + status active.

    Flujo fase 1 (hasta 20 clientes): pago por QR/transferencia verificado
    manualmente por el SuperAdmin, que ejecuta esta accion desde su panel.
    """
    plan = await session.get(PlatformPlan, payload.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")

    # cancelar suscripciones activas previas
    prev = (
        await session.execute(
            select(TenantSubscription).where(
                TenantSubscription.tenant_id == tenant_id,
                TenantSubscription.status == "active",
            )
        )
    ).scalars().all()
    for sub in prev:
        sub.status = "canceled"

    period = payload.months or 1
    amount = float(plan.price_cop) * period
    sub = TenantSubscription(
        tenant_id=tenant_id,
        plan_id=plan.id,
        status="active",
        current_period_start=utcnow(),
        current_period_end=utcnow() + timedelta(days=30 * period),
        amount_cop=amount,
        payment_gateway="manual_qr",
    )
    session.add(sub)
    tenant.status = "active"
    import json as _json
    session.add(TenantAuditLog(
        tenant_id=tenant_id,
        user_id=admin.id,
        user_name=admin.name,
        action="activate_subscription",
        entity_type="tenant_subscription",
        entity_id=tenant_id,
        details=_json.dumps({"plan": plan.id, "months": period, "amount_cop": amount}),
    ))
    await session.commit()
    return {
        "ok": True,
        "tenant_id": tenant_id,
        "plan": plan.id,
        "months": period,
        "period_end": sub.current_period_end.isoformat(),
        "amount_cop": amount,
    }


@router.post("/superadmin/plans")
async def create_or_update_plan(
    payload: PlatformPlanCreate,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_superadmin),
):
    plan = await session.get(PlatformPlan, payload.id)
    if plan:
        for k, v in payload.model_dump().items():
            setattr(plan, k, v)
    else:
        plan = PlatformPlan(**payload.model_dump())
        session.add(plan)
    await session.commit()
    return {"ok": True, "plan_id": plan.id}
