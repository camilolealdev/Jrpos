import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_session
from models_sql import (
    CashPickup,
    CashSession,
    CategoryMeta,
    CommissionRule,
    Contact,
    CreditNote,
    Document,
    DocumentItem,
    Expense,
    HeldSale,
    HeldSaleItem,
    Payment,
    Payroll,
    Product,
    Promotion,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseOrder,
    PurchaseOrderItem,
    Sale,
    SaleItem,
    SettingsCertificate,
    SettingsElectronic,
    SettingsGeneral,
    SettingsTimeclockSchedule,
    SupportDoc,
    SupportDocItem,
    Timeclock,
    User,
    Warranty,
)

settings_router = APIRouter(prefix="/api", tags=["settings"])


# ----------------- POS Electrónica (SIMULADA DIAN) -----------------
class ElectronicSettingsIn(BaseModel):
    nit: str = ""
    razon_social: str = ""
    resolucion: str = ""
    prefijo: str = "FE"
    rango_desde: int = 1
    rango_hasta: int = 999999
    fecha_resolucion: str = ""


def _electronic_defaults() -> dict:
    return ElectronicSettingsIn().model_dump()


@settings_router.get("/electronic/settings")
async def get_electronic_settings(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(SettingsElectronic).where(SettingsElectronic.tenant_id == tenant_id)
    row = (await session.execute(stmt)).scalars().first()
    base = _electronic_defaults()
    if row:
        for key in base:
            val = getattr(row, key, None)
            if val is not None:
                base[key] = val
    return base


@settings_router.put("/electronic/settings")
async def save_electronic_settings(
    payload: ElectronicSettingsIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(SettingsElectronic).where(SettingsElectronic.tenant_id == tenant_id)
    row = (await session.execute(stmt)).scalars().first()
    if row is None:
        row = SettingsElectronic(tenant_id=tenant_id, **payload.model_dump())
        session.add(row)
    else:
        for key, value in payload.model_dump().items():
            setattr(row, key, value)
    await session.commit()
    return {"ok": True}


# ----------------- Marcación: horario programable (admin) -----------------
class TimeclockScheduleIn(BaseModel):
    entry_time: str = "08:00"
    exit_time: str = "18:00"
    tolerance_minutes: int = 10


def _schedule_defaults() -> dict:
    return TimeclockScheduleIn().model_dump()


@settings_router.get("/timeclock/schedule")
async def get_schedule(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(SettingsTimeclockSchedule).where(SettingsTimeclockSchedule.tenant_id == tenant_id)
    row = (await session.execute(stmt)).scalars().first()
    base = _schedule_defaults()
    if row:
        for key in base:
            val = getattr(row, key, None)
            if val is not None:
                base[key] = val
    return base


@settings_router.put("/timeclock/schedule")
async def save_schedule(
    payload: TimeclockScheduleIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    stmt = select(SettingsTimeclockSchedule).where(SettingsTimeclockSchedule.tenant_id == tenant_id)
    row = (await session.execute(stmt)).scalars().first()
    if row is None:
        row = SettingsTimeclockSchedule(tenant_id=tenant_id, **payload.model_dump())
        session.add(row)
    else:
        for key, value in payload.model_dump().items():
            setattr(row, key, value)
    await session.commit()
    return {"ok": True}


# ----------------- General settings (personalización & IA) -----------------
class GeneralSettingsIn(BaseModel):
    store_name: str = "JRPOS"
    logo_url: Optional[str] = None
    store_slogan: Optional[str] = None
    store_nit: Optional[str] = None
    store_address: Optional[str] = None
    store_city: Optional[str] = None
    store_department: Optional[str] = None
    tax_regime: Optional[str] = "No responsable de IVA"
    currency_symbol: Optional[str] = "$"
    
    ticket_footer: str = "¡Gracias por su compra!"
    ticket_header_line1: Optional[str] = None
    ticket_header_line2: Optional[str] = None
    ticket_show_barcode: Optional[bool] = True
    
    iva_default: float = 19
    printer_width: int = 58  # 58 | 80 mm
    accent: str = "emerald"  # emerald | ocean | terracotta | berry | slate | violet | amber | rose
    support_phone: str = ""
    
    # AI & OCR Engine Configuration
    ai_provider: Optional[str] = "gemini"  # gemini | openrouter | nvidia | groq | custom_openai
    ai_api_key: Optional[str] = None
    ai_model: Optional[str] = "gemini-1.5-flash"
    ai_base_url: Optional[str] = None

    # POS Ergonomics
    pos_audio_beep: Optional[bool] = True
    pos_ask_clear_cart: Optional[bool] = True
    pos_require_credit_customer: Optional[bool] = True

    # Tipo de negocio (gating de módulos de la sidebar)
    business_type: Optional[str] = "abarrotes"
    hidden_module_tids: list = Field(default_factory=list)


from db_migrations import run_auto_migrations
from redis_client import get_json, set_json, delete_key


def _general_defaults() -> dict:
    return GeneralSettingsIn().model_dump()


ADMIN_ONLY_GENERAL_FIELDS = ("ai_api_key", "ai_base_url")


@settings_router.get("/settings/general")
async def get_general_settings(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    cache_key = f"cache:settings_general:{tenant_id}"
    cached = await get_json(cache_key)
    if cached is not None:
        result = dict(cached)
        if user.role != "admin":
            for key in ADMIN_ONLY_GENERAL_FIELDS:
                result.pop(key, None)
        return result

    base = _general_defaults()
    try:
        stmt = select(SettingsGeneral).where(SettingsGeneral.tenant_id == tenant_id)
        row = (await session.execute(stmt)).scalars().first()
        if row:
            for key in base:
                val = getattr(row, key, None)
                if val is not None:
                    base[key] = val
    except Exception:
        await session.rollback()
        await run_auto_migrations(session)
        try:
            stmt = select(SettingsGeneral).where(SettingsGeneral.tenant_id == tenant_id)
            row = (await session.execute(stmt)).scalars().first()
            if row:
                for key in base:
                    val = getattr(row, key, None)
                    if val is not None:
                        base[key] = val
        except Exception:
            pass

    # Disponibilidad de claves de plataforma (pool del operador, sin garantía):
    # solo booleanos por proveedor — nunca se exponen los valores de las claves.
    base["platform_ai_keys"] = {
        "gemini": bool(os.environ.get("GEMINI_API_KEY", "").strip()),
        "openrouter": bool(os.environ.get("OPENROUTER_API_KEY", "").strip()),
        "groq": bool(os.environ.get("GROQ_API_KEY", "").strip()),
        "nvidia": bool(os.environ.get("NVIDIA_API_KEY", "").strip()),
    }

    # Guardar en Redis con TTL de 120s
    await set_json(cache_key, base, ttl=120)

    result = dict(base)
    if user.role != "admin":
        for key in ADMIN_ONLY_GENERAL_FIELDS:
            result.pop(key, None)
    return result


@settings_router.put("/settings/general")
async def save_general_settings(
    payload: GeneralSettingsIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    if payload.printer_width not in (58, 80):
        raise HTTPException(status_code=400, detail="Ancho de impresora debe ser 58 u 80")
    
    data = payload.model_dump()
    data["iva_default"] = int(data["iva_default"])
    data["tenant_id"] = tenant_id
    
    try:
        stmt = select(SettingsGeneral).where(SettingsGeneral.tenant_id == tenant_id)
        row = (await session.execute(stmt)).scalars().first()
    except Exception:
        await session.rollback()
        await run_auto_migrations(session)
        stmt = select(SettingsGeneral).where(SettingsGeneral.tenant_id == tenant_id)
        row = (await session.execute(stmt)).scalars().first()

    if row is None:
        row = SettingsGeneral(**data)
        session.add(row)
    else:
        for key, value in data.items():
            setattr(row, key, value)
    
    try:
        await session.commit()
    except Exception:
        await session.rollback()
        await run_auto_migrations(session)
        stmt = select(SettingsGeneral).where(SettingsGeneral.tenant_id == tenant_id)
        row = (await session.execute(stmt)).scalars().first()
        if row is None:
            row = SettingsGeneral(**data)
            session.add(row)
        else:
            for key, value in data.items():
                setattr(row, key, value)
        await session.commit()

    # Invalidar cache inmediatamente
    await delete_key(f"cache:settings_general:{tenant_id}")

    return {"ok": True}


# ----------------- Prueba de conexión con proveedor de IA -----------------
class TestAIIn(BaseModel):
    provider: str = "gemini"
    api_key: Optional[str] = None
    model: Optional[str] = None
    base_url: Optional[str] = None


@settings_router.post("/settings/test-ai")
async def test_ai_connection(
    payload: TestAIIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    provider = (payload.provider or "gemini").lower()
    api_key = (payload.api_key or "").strip()
    if not api_key and provider == "gemini":
        api_key = os.environ.get("GEMINI_API_KEY", "")

    if not api_key:
        raise HTTPException(status_code=400, detail=f"Debes ingresar una API Key para {provider}")

    import httpx

    if provider == "gemini":
        from google import genai
        model_name = payload.model or "gemini-1.5-flash"
        try:
            client = genai.Client(api_key=api_key)
            response = await client.aio.models.generate_content(
                model=model_name,
                contents="Di 'OK' para verificar la conexión con JRPOS.",
            )
            text_out = response.text or "OK"
            return {"ok": True, "message": f"Conectado exitosamente con Google Gemini ({model_name})", "response": text_out.strip()}
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Error conectando con Gemini: {str(e)}")

    # Proveedores compatibles con OpenAI (OpenRouter, NVIDIA NIM, Groq, Custom)
    url_map = {
        "openrouter": "https://openrouter.ai/api/v1",
        "nvidia": "https://integrate.api.nvidia.com/v1",
        "groq": "https://api.groq.com/openai/v1",
    }
    base_url = (payload.base_url or "").strip().rstrip("/") or url_map.get(provider, "https://api.openai.com/v1")
    default_models = {
        "openrouter": "google/gemini-2.0-flash-exp:free",
        "nvidia": "meta/llama-3.2-11b-vision-instruct",
        "groq": "llama-3.2-11b-vision-preview",
        "custom_openai": "gpt-4o-mini",
    }
    model_name = (payload.model or "").strip() or default_models.get(provider, "gpt-4o-mini")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if provider == "openrouter":
        headers["HTTP-Referer"] = "https://jrpos.com"
        headers["X-Title"] = "JRPOS Scanner"

    req_body = {
        "model": model_name,
        "messages": [{"role": "user", "content": "Di 'OK' para verificar la conexión con JRPOS."}],
        "max_tokens": 15,
        "temperature": 0.1,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            res = await http_client.post(f"{base_url}/chat/completions", json=req_body, headers=headers)
            if res.status_code != 200:
                err_text = res.text
                raise HTTPException(status_code=res.status_code, detail=f"El proveedor {provider} devolvió status {res.status_code}: {err_text}")
            data = res.json()
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "OK")
            return {"ok": True, "message": f"Conectado exitosamente con {provider.upper()} ({model_name})", "response": content.strip()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fallo de conexión HTTP con {provider}: {str(e)}")


# ----------------- Certificado Digital (metadata) -----------------
class CertificateIn(BaseModel):
    filename: Optional[str] = None
    size: Optional[int] = None
    expires: Optional[str] = None


@settings_router.post("/electronic/certificate")
async def upload_certificate(
    payload: CertificateIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    tenant_id = admin.tenant_id or "tenant-default-001"
    if not payload.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")
    cert_values = {
        "tenant_id": tenant_id,
        "filename": payload.filename,
        "size": payload.size,
        "expires": payload.expires,
        "uploaded_by": admin.email,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    stmt = select(SettingsCertificate).where(SettingsCertificate.tenant_id == tenant_id)
    row = (await session.execute(stmt)).scalars().first()
    if row is None:
        row = SettingsCertificate(**cert_values)
        session.add(row)
    else:
        for key, value in cert_values.items():
            setattr(row, key, value)
    await session.commit()
    return cert_values


@settings_router.get("/electronic/certificate")
async def get_certificate(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    tenant_id = user.tenant_id or "tenant-default-001"
    stmt = select(SettingsCertificate).where(SettingsCertificate.tenant_id == tenant_id)
    row = (await session.execute(stmt)).scalars().first()
    if not row:
        return {}
    return {
        "filename": row.filename,
        "size": row.size,
        "expires": row.expires,
        "uploaded_by": row.uploaded_by,
        "uploaded_at": row.uploaded_at,
    }


# ----------------- Gestión de Datos & Puesta en Producción -----------------
@settings_router.get("/settings/data-stats")
async def get_data_stats(
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """Retorna conteos actuales de la base de datos para auditoría previa a producción."""
    tenant_id = admin.tenant_id or "tenant-default-001"
    products = (await session.execute(select(func.count(Product.id)).where(Product.tenant_id == tenant_id))).scalar_one()
    contacts = (await session.execute(select(func.count(Contact.id)).where(Contact.tenant_id == tenant_id))).scalar_one()
    sales = (await session.execute(select(func.count(Sale.id)).where(Sale.tenant_id == tenant_id))).scalar_one()
    payments = (await session.execute(select(func.count(Payment.id)).where(Payment.tenant_id == tenant_id))).scalar_one()
    expenses = (await session.execute(select(func.count(Expense.id)).where(Expense.tenant_id == tenant_id))).scalar_one()
    invoices = (await session.execute(select(func.count(PurchaseInvoice.id)).where(PurchaseInvoice.tenant_id == tenant_id))).scalar_one()
    cash_sessions = (await session.execute(select(func.count(CashSession.id)).where(CashSession.tenant_id == tenant_id))).scalar_one()
    timeclock = (await session.execute(select(func.count(Timeclock.id)).where(Timeclock.tenant_id == tenant_id))).scalar_one()

    return {
        "products": products,
        "contacts": contacts,
        "sales": sales,
        "payments": payments,
        "expenses": expenses,
        "invoices": invoices,
        "cash_sessions": cash_sessions,
        "timeclock": timeclock,
        "is_clean_slate": (sales == 0 and expenses == 0 and invoices == 0),
    }


class WipeDataIn(BaseModel):
    confirm_phrase: str
    scope: str = "transactions_only"  # "transactions_only" | "full_clean_slate"
    keep_products: bool = True
    keep_contacts: bool = True


@settings_router.post("/settings/wipe-data")
async def wipe_data(
    payload: WipeDataIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    """
    Limpia de forma segura los datos transaccionales o la base de datos completa
    para iniciar producción real desde cero. Los usuarios y configuraciones se preservan.
    """
    tenant_id = admin.tenant_id or "tenant-default-001"
    valid_phrases = ["BORRAR", "PRODUCCION", "PRODUCCIÓN", "RESET", "LIMPIAR"]
    if payload.confirm_phrase.strip().upper() not in valid_phrases:
        raise HTTPException(
            status_code=400,
            detail="Frase de confirmación inválida. Escribe 'PRODUCCION' o 'BORRAR' para autorizar el vaciado.",
        )

    deleted_counts: Dict[str, int] = {}

    # 1. Borrar todas las transacciones operativas y registros auxiliares del tenant
    trans_sequence = [
        ("sale_items", SaleItem),
        ("payments", Payment),
        ("sales", Sale),
        ("held_sale_items", HeldSaleItem),
        ("held_sales", HeldSale),
        ("credit_notes", CreditNote),
        ("warranties", Warranty),
        ("document_items", DocumentItem),
        ("documents", Document),
        ("purchase_invoice_items", PurchaseInvoiceItem),
        ("purchase_invoices", PurchaseInvoice),
        ("purchase_order_items", PurchaseOrderItem),
        ("purchase_orders", PurchaseOrder),
        ("support_doc_items", SupportDocItem),
        ("support_docs", SupportDoc),
        ("cash_pickups", CashPickup),
        ("cash_sessions", CashSession),
        ("expenses", Expense),
        ("timeclock", Timeclock),
        ("payroll", Payroll),
    ]

    for label, model in trans_sequence:
        res = await session.execute(delete(model).where(model.tenant_id == tenant_id))
        deleted_counts[label] = res.rowcount or 0

    # 2. Manejo de productos y catálogo
    if payload.scope == "full_clean_slate" or not payload.keep_products:
        res_p = await session.execute(delete(Product).where(Product.tenant_id == tenant_id))
        deleted_counts["products"] = res_p.rowcount or 0
        res_cat = await session.execute(delete(CategoryMeta).where(CategoryMeta.tenant_id == tenant_id))
        deleted_counts["category_meta"] = res_cat.rowcount or 0
        res_prom = await session.execute(delete(Promotion).where(Promotion.tenant_id == tenant_id))
        deleted_counts["promotions"] = res_prom.rowcount or 0

    # 3. Manejo de contactos (clientes / proveedores)
    if payload.scope == "full_clean_slate" or not payload.keep_contacts:
        res_c = await session.execute(delete(Contact).where(Contact.tenant_id == tenant_id))
        deleted_counts["contacts"] = res_c.rowcount or 0
        
        # Siempre re-sembrar el Consumidor Final estándar para mostrador de este tenant
        final_consumer = Contact(
            tenant_id=tenant_id,
            kind="customer",
            name="Consumidor Final",
            document="222222222222",
            document_type="NIT",
            city="Colombia",
            notes="Cliente genérico estándar para ventas rápidas",
        )
        session.add(final_consumer)

    await session.commit()

    return {
        "ok": True,
        "message": "Base de datos preparada exitosamente para producción.",
        "scope": payload.scope,
        "deleted_counts": deleted_counts,
    }

