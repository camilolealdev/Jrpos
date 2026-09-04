from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, require_admin
from db import get_session
from models_sql import SettingsCertificate, SettingsElectronic, SettingsGeneral, SettingsTimeclockSchedule, User

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
    row = await session.get(SettingsElectronic, 1)
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
    row = await session.get(SettingsElectronic, 1)
    if row is None:
        row = SettingsElectronic(id=1, **payload.model_dump())
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
    row = await session.get(SettingsTimeclockSchedule, 1)
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
    row = await session.get(SettingsTimeclockSchedule, 1)
    if row is None:
        row = SettingsTimeclockSchedule(id=1, **payload.model_dump())
        session.add(row)
    else:
        for key, value in payload.model_dump().items():
            setattr(row, key, value)
    await session.commit()
    return {"ok": True}


# ----------------- General settings (personalización) -----------------
class GeneralSettingsIn(BaseModel):
    store_name: str = "JRPOS"
    ticket_footer: str = "¡Gracias por su compra!"
    iva_default: float = 19
    printer_width: int = 58  # 58 | 80 mm
    accent: str = "emerald"  # emerald | ocean | terracotta | berry | slate
    support_phone: str = ""


def _general_defaults() -> dict:
    return GeneralSettingsIn().model_dump()


@settings_router.get("/settings/general")
async def get_general_settings(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    row = await session.get(SettingsGeneral, 1)
    base = _general_defaults()
    if row:
        for key in base:
            val = getattr(row, key, None)
            if val is not None:
                base[key] = val
    return base


@settings_router.put("/settings/general")
async def save_general_settings(
    payload: GeneralSettingsIn,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_admin),
):
    if payload.printer_width not in (58, 80):
        raise HTTPException(status_code=400, detail="Ancho de impresora debe ser 58 u 80")
    row = await session.get(SettingsGeneral, 1)
    data = payload.model_dump()
    data["iva_default"] = int(data["iva_default"])
    if row is None:
        row = SettingsGeneral(id=1, **data)
        session.add(row)
    else:
        for key, value in data.items():
            setattr(row, key, value)
    await session.commit()
    return {"ok": True}


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
    if not payload.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")
    cert_values = {
        "filename": payload.filename,
        "size": payload.size,
        "expires": payload.expires,
        "uploaded_by": admin.email,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    row = await session.get(SettingsCertificate, 1)
    if row is None:
        row = SettingsCertificate(id=1, **cert_values)
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
    row = await session.get(SettingsCertificate, 1)
    if not row:
        return {}
    return {
        "filename": row.filename,
        "size": row.size,
        "expires": row.expires,
        "uploaded_by": row.uploaded_by,
        "uploaded_at": row.uploaded_at,
    }
