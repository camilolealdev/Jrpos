import json as _json
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import _cookie_flags, create_access_token, get_current_user, require_superadmin
from db import get_session
from models_sql import (
    PlatformPlan,
    Sale,
    SupportTicket,
    Tenant,
    TenantAuditLog,
    TenantSubscription,
    User,
    new_uuid,
    utcnow,
)

router = APIRouter(prefix="/api/superadmin", tags=["superadmin"])
support_router = APIRouter(prefix="/api/support", tags=["support"])


def _audit(session: AsyncSession, *, admin: User, tenant_id: str, action: str, entity_type: str, entity_id: str, details: Any) -> None:
    """Escribe un registro de auditoría de plataforma (tenant_audit_logs)."""
    session.add(TenantAuditLog(
        tenant_id=tenant_id,
        user_id=admin.id,
        user_name=admin.name,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details if isinstance(details, str) else _json.dumps(details, ensure_ascii=False, default=str),
    ))


class ExtendTrialRequest(BaseModel):
    days: int = 15


class UpdateStatusRequest(BaseModel):
    status: str  # trial | active | suspended | expired


class UpdateModulesRequest(BaseModel):
    modules_config: Dict[str, bool]


class UpdateTicketRequest(BaseModel):
    status: Optional[str] = None  # abierto | en_proceso | resuelto | cerrado
    admin_notes: Optional[str] = None


class CreateTicketRequest(BaseModel):
    subject: str = Field(..., min_length=3, max_length=255)
    message: str = Field(..., min_length=5)
    priority: str = Field(default="media")  # baja | media | alta | urgente
    user_phone: Optional[str] = None


@router.get("/stats")
async def get_platform_stats(admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    total_tenants = (await session.execute(select(func.count(Tenant.id)))).scalar() or 0
    active_tenants = (await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "active"))).scalar() or 0
    trial_tenants = (await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "trial"))).scalar() or 0
    suspended_tenants = (await session.execute(select(func.count(Tenant.id)).where(Tenant.status == "suspended"))).scalar() or 0
    total_users = (await session.execute(select(func.count(User.id)))).scalar() or 0
    total_sales_count = (await session.execute(select(func.count(Sale.id)))).scalar() or 0
    total_sales_volume = (await session.execute(select(func.sum(Sale.total)))).scalar() or 0.0
    open_tickets = (await session.execute(select(func.count(SupportTicket.id)).where(SupportTicket.status.in_(["abierto", "en_proceso"])))).scalar() or 0

    # Estimado de MRR
    subscriptions = (await session.execute(
        select(TenantSubscription).where(TenantSubscription.status.in_(["active", "trial"]))
    )).scalars().all()

    estimated_mrr = sum(s.amount_cop for s in subscriptions if s.status == "active")

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "trial_tenants": trial_tenants,
        "suspended_tenants": suspended_tenants,
        "total_users": total_users,
        "total_sales_count": total_sales_count,
        "total_sales_volume_cop": round(total_sales_volume, 2),
        "estimated_mrr_cop": round(estimated_mrr, 2),
        "open_tickets": open_tickets,
    }


@router.get("/tenants")
async def list_tenants(admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    tenants = (await session.execute(select(Tenant).order_by(Tenant.created_at.desc()))).scalars().all()
    now = utcnow()

    DEFAULT_MODULES = {
        "ia_ocr": True,
        "whatsapp": True,
        "electronic_invoicing": False,
        "multi_cashier": True,
        "accounting_export": True,
        "warranties": True,
        "promotions": True,
        "payroll": False,
    }

    result = []
    for t in tenants:
        days_left = max(0, (t.trial_ends_at - now).days) if t.trial_ends_at else 0
        users_count = (await session.execute(select(func.count(User.id)).where(User.tenant_id == t.id))).scalar() or 0
        sales_count = (await session.execute(select(func.count(Sale.id)).where(Sale.tenant_id == t.id))).scalar() or 0
        sales_volume = (await session.execute(select(func.sum(Sale.total)).where(Sale.tenant_id == t.id))).scalar() or 0.0

        modules = {**DEFAULT_MODULES, **(t.modules_config or {})}

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
            "modules_config": modules,
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

    _audit(session, admin=admin, tenant_id=tenant.id, action="extend_trial", entity_type="tenant",
           entity_id=tenant.id, details={"days_added": payload.days, "new_trial_ends_at": tenant.trial_ends_at.isoformat()})

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

    old_status = tenant.status
    tenant.status = payload.status
    tenant.updated_at = utcnow()

    _audit(session, admin=admin, tenant_id=tenant.id, action="update_status", entity_type="tenant",
           entity_id=tenant.id, details={"from": old_status, "to": payload.status})

    await session.commit()
    return {"ok": True, "tenant_id": tenant.id, "status": tenant.status}


@router.put("/tenants/{tenant_id}/modules")
async def update_tenant_modules(tenant_id: str, payload: UpdateModulesRequest, admin: User = Depends(require_superadmin), session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Inquilino no encontrado")

    current = tenant.modules_config or {}
    tenant.modules_config = {**current, **payload.modules_config}
    tenant.updated_at = utcnow()

    # Log audit
    session.add(TenantAuditLog(
        tenant_id=tenant.id,
        user_id=admin.id,
        user_name=admin.name,
        action="update_modules",
        entity_type="tenant_modules",
        entity_id=tenant.id,
        details=f"Modules updated: {payload.modules_config}",
    ))

    await session.commit()
    return {"ok": True, "tenant_id": tenant.id, "modules_config": tenant.modules_config}


@router.get("/tickets")
async def list_support_tickets(
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    admin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session)
):
    query = select(SupportTicket).order_by(SupportTicket.created_at.desc())
    if status and status != "todos":
        query = query.where(SupportTicket.status == status)
    if tenant_id:
        query = query.where(SupportTicket.tenant_id == tenant_id)

    tickets = (await session.execute(query)).scalars().all()
    tenants_map = {t.id: t.business_name for t in (await session.execute(select(Tenant))).scalars().all()}

    return [
        {
            "id": tk.id,
            "tenant_id": tk.tenant_id,
            "tenant_name": tenants_map.get(tk.tenant_id, "Tienda"),
            "user_id": tk.user_id,
            "user_name": tk.user_name,
            "user_email": tk.user_email,
            "user_phone": tk.user_phone,
            "subject": tk.subject,
            "message": tk.message,
            "priority": tk.priority,
            "status": tk.status,
            "admin_notes": tk.admin_notes,
            "created_at": tk.created_at.isoformat() if tk.created_at else None,
            "updated_at": tk.updated_at.isoformat() if tk.updated_at else None,
        }
        for tk in tickets
    ]


@router.put("/tickets/{ticket_id}")
async def update_support_ticket(
    ticket_id: str,
    payload: UpdateTicketRequest,
    admin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session)
):
    ticket = await session.get(SupportTicket, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket no encontrado")

    if payload.status:
        if payload.status not in ("abierto", "en_proceso", "resuelto", "cerrado"):
            raise HTTPException(status_code=400, detail="Estado de ticket inválido")
        ticket.status = payload.status

    if payload.admin_notes is not None:
        ticket.admin_notes = payload.admin_notes

    ticket.updated_at = utcnow()
    _audit(session, admin=admin, tenant_id=ticket.tenant_id, action="update_support_ticket", entity_type="support_ticket",
           entity_id=ticket.id, details={"status": ticket.status, "admin_notes": ticket.admin_notes})
    await session.commit()
    return {"ok": True, "ticket_id": ticket.id, "status": ticket.status, "admin_notes": ticket.admin_notes}


class ImpersonateRequest(BaseModel):
    reason: str = Field(..., min_length=10, max_length=500, description="Motivo documentado de la asistencia técnica")


@router.post("/impersonate/{tenant_id}")
async def impersonate_tenant(
    tenant_id: str,
    payload: ImpersonateRequest,
    response: Response,
    admin: User = Depends(require_superadmin),
    session: AsyncSession = Depends(get_session),
):
    tenant = await session.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Inquilino no encontrado")

    # Find tenant admin user
    tenant_admin = (await session.execute(
        select(User).where(User.tenant_id == tenant_id, User.role == "admin")
    )).scalars().first()

    if not tenant_admin:
        # Fallback to any user in tenant
        tenant_admin = (await session.execute(
            select(User).where(User.tenant_id == tenant_id)
        )).scalars().first()

    if not tenant_admin:
        raise HTTPException(status_code=404, detail="No hay usuarios registrados en esta tienda")

    # Emitir token de corta duración (30 min) con trazabilidad de actor
    access_token = create_access_token(
        user_id=tenant_admin.id,
        email=tenant_admin.email,
        role=tenant_admin.role,
        tenant_id=tenant_id,
        expires_delta=timedelta(minutes=30),
        actor_id=admin.id,
        is_impersonated=True,
    )

    is_secure, same_site = _cookie_flags()
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=is_secure,
        samesite=same_site,
        max_age=1800,  # 30 minutos
        path="/"
    )

    _audit(
        session,
        admin=admin,
        tenant_id=tenant_id,
        action="impersonate",
        entity_type="user",
        entity_id=tenant_admin.id,
        details={
            "reason": payload.reason,
            "actor_id": admin.id,
            "actor_email": admin.email,
            "impersonated_email": tenant_admin.email,
            "impersonated_role": tenant_admin.role,
            "expires_in_minutes": 30,
        },
    )
    await session.commit()

    return {
        "ok": True,
        "impersonated_user": {
            "id": tenant_admin.id,
            "email": tenant_admin.email,
            "name": tenant_admin.name,
            "role": tenant_admin.role,
            "tenant_id": tenant_id,
            "business_name": tenant.business_name,
        },
        "session": {
            "is_impersonated": True,
            "actor_id": admin.id,
            "expires_in_seconds": 1800,
        }
    }


# =====================================================================
# TENANT-FACING SUPPORT ENDPOINTS (/api/support/tickets)
# =====================================================================

@support_router.post("/tickets")
async def create_tenant_support_ticket(
    payload: CreateTicketRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    tenant_id = user.tenant_id or "tenant-default-001"
    ticket = SupportTicket(
        id=new_uuid(),
        tenant_id=tenant_id,
        user_id=user.id,
        user_name=user.name,
        user_email=user.email,
        user_phone=payload.user_phone,
        subject=payload.subject,
        message=payload.message,
        priority=payload.priority,
        status="abierto",
    )
    session.add(ticket)
    await session.commit()
    return {"ok": True, "ticket_id": ticket.id, "status": ticket.status}


@support_router.get("/tickets")
async def get_my_support_tickets(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session)
):
    tenant_id = user.tenant_id or "tenant-default-001"
    tickets = (await session.execute(
        select(SupportTicket)
        .where(SupportTicket.tenant_id == tenant_id)
        .order_by(SupportTicket.created_at.desc())
    )).scalars().all()

    return [
        {
            "id": tk.id,
            "subject": tk.subject,
            "message": tk.message,
            "priority": tk.priority,
            "status": tk.status,
            "admin_notes": tk.admin_notes,
            "created_at": tk.created_at.isoformat() if tk.created_at else None,
            "updated_at": tk.updated_at.isoformat() if tk.updated_at else None,
        }
        for tk in tickets
    ]

