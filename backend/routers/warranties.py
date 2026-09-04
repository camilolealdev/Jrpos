from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import User, Warranty

warranties_router = APIRouter(prefix="/api", tags=["warranties"])


class WarrantyCreate(BaseModel):
    sale_id: Optional[str] = None
    sale_number: Optional[str] = None
    product_name: Optional[str] = None
    reason: Optional[str] = None
    resolution: str = "cambio"


class WarrantyUpdate(BaseModel):
    status: Optional[str] = None
    resolution: Optional[str] = None


class WarrantyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    sale_id: Optional[str] = None
    sale_number: Optional[str] = None
    product_name: str
    reason: Optional[str] = None
    resolution: str
    status: str
    created_at: datetime


# ----------------- Garantías y Devoluciones -----------------
@warranties_router.post("/warranties", response_model=WarrantyOut)
async def create_warranty(
    payload: WarrantyCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if not payload.product_name:
        raise HTTPException(status_code=400, detail="Producto requerido")

    seq = (await session.execute(text("SELECT nextval('warranties_number_seq')"))).scalar_one()
    number = f"GAR-{seq:06d}"

    warranty = Warranty(
        number=number, sale_id=payload.sale_id, sale_number=payload.sale_number,
        product_name=payload.product_name, reason=payload.reason,
        resolution=payload.resolution or "cambio", status="abierta",
    )
    session.add(warranty)
    await session.commit()
    await session.refresh(warranty)
    return warranty


@warranties_router.get("/warranties", response_model=List[WarrantyOut])
async def list_warranties(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Warranty).order_by(Warranty.created_at.desc()).limit(300)
    return (await session.execute(stmt)).scalars().all()


@warranties_router.put("/warranties/{wid}", response_model=WarrantyOut)
async def update_warranty(
    wid: str,
    payload: WarrantyUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    warranty = await session.get(Warranty, wid)
    if not warranty:
        raise HTTPException(status_code=404, detail="No encontrada")
    warranty.status = payload.status
    warranty.resolution = payload.resolution
    await session.commit()
    await session.refresh(warranty)
    return warranty
