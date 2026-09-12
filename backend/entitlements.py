from typing import Optional
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models_sql import Branch, PlatformPlan, Product, TenantSubscription, User


class DefaultPlanLimits:
    max_branches: int = 3
    max_users: int = 10
    max_products: int = 5000
    ai_ocr_enabled: bool = True
    dian_enabled: bool = False


async def get_tenant_plan_limits(session: AsyncSession, tenant_id: str) -> PlatformPlan | DefaultPlanLimits:
    """
    Obtiene los límites comerciales vigentes del plan suscrito por el tenant.
    Si no tiene suscripción activa o plan definido, retorna los límites predeterminados de prueba/básico.
    """
    sub_stmt = (
        select(TenantSubscription)
        .where(
            TenantSubscription.tenant_id == tenant_id,
            TenantSubscription.status.in_(["active", "trial"]),
        )
        .order_by(TenantSubscription.created_at.desc())
    )
    sub = (await session.execute(sub_stmt)).scalars().first()

    if sub and sub.plan_id:
        plan = await session.get(PlatformPlan, sub.plan_id)
        if plan:
            return plan

    return DefaultPlanLimits()


async def check_product_limit(session: AsyncSession, tenant_id: str, qty_to_add: int = 1) -> None:
    """
    Verifica que la cantidad actual de productos más los nuevos a insertar no exceda el límite del plan.
    Lanza HTTPException(402) si se sobrepasa el límite.
    """
    limits = await get_tenant_plan_limits(session, tenant_id)
    max_prods = getattr(limits, "max_products", 5000)

    count_stmt = select(func.count(Product.id)).where(Product.tenant_id == tenant_id)
    current_count = (await session.execute(count_stmt)).scalar() or 0

    if current_count + qty_to_add > max_prods:
        raise HTTPException(
            status_code=402,
            detail=f"Límite de productos excedido ({current_count}/{max_prods}). Actualiza tu plan para agregar más productos.",
            headers={"X-Error-Code": "PLAN_LIMIT_EXCEEDED"},
        )


async def check_user_limit(session: AsyncSession, tenant_id: str) -> None:
    """
    Verifica que la creación de un nuevo usuario no exceda el límite del plan comercial.
    Lanza HTTPException(402) si se sobrepasa el límite.
    """
    limits = await get_tenant_plan_limits(session, tenant_id)
    max_users = getattr(limits, "max_users", 3)

    count_stmt = select(func.count(User.id)).where(User.tenant_id == tenant_id)
    current_count = (await session.execute(count_stmt)).scalar() or 0

    if current_count + 1 > max_users:
        raise HTTPException(
            status_code=402,
            detail=f"Límite de colaboradores alcanzado ({current_count}/{max_users}). Actualiza tu plan para agregar más usuarios.",
            headers={"X-Error-Code": "PLAN_LIMIT_EXCEEDED"},
        )


async def check_branch_limit(session: AsyncSession, tenant_id: str) -> None:
    """
    Verifica que la apertura de una nueva sucursal no exceda el límite permitido por el plan.
    Lanza HTTPException(402) si se sobrepasa el límite.
    """
    limits = await get_tenant_plan_limits(session, tenant_id)
    max_branches = getattr(limits, "max_branches", 1)

    count_stmt = select(func.count(Branch.id)).where(Branch.tenant_id == tenant_id)
    current_count = (await session.execute(count_stmt)).scalar() or 0

    if current_count + 1 > max_branches:
        raise HTTPException(
            status_code=402,
            detail=f"Límite de sucursales alcanzado ({current_count}/{max_branches}). Contrata un plan multi-sede para habilitar más sucursales.",
            headers={"X-Error-Code": "PLAN_LIMIT_EXCEEDED"},
        )


async def check_feature_enabled(session: AsyncSession, tenant_id: str, feature: str) -> None:
    """
    Verifica si una funcionalidad específica (ej: 'ai_ocr', 'dian') está permitida en el plan comercial.
    Lanza HTTPException(402) si no está incluida.
    """
    limits = await get_tenant_plan_limits(session, tenant_id)

    if feature == "ai_ocr":
        enabled = getattr(limits, "ai_ocr_enabled", True)
        if not enabled:
            raise HTTPException(
                status_code=402,
                detail="El escaneo inteligente con IA (OCR) no está incluido en tu plan actual.",
                headers={"X-Error-Code": "FEATURE_NOT_IN_PLAN"},
            )
    elif feature == "dian":
        enabled = getattr(limits, "dian_enabled", False)
        if not enabled:
            raise HTTPException(
                status_code=402,
                detail="El módulo de facturación electrónica DIAN no está habilitado en tu plan actual.",
                headers={"X-Error-Code": "FEATURE_NOT_IN_PLAN"},
            )
