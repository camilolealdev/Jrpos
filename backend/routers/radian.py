from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from db import get_session
from models_sql import Sale, User

radian_router = APIRouter(prefix="/api", tags=["radian"])


class RadianInvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    electronic_number: Optional[str] = None
    cufe: Optional[str] = None
    total: float
    created_at: datetime
    electronic_status: Optional[str] = None


# ----------------- RADIAN (simulado) -----------------
@radian_router.get("/radian/invoices", response_model=List[RadianInvoiceOut])
async def radian_invoices(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    stmt = select(Sale).where(Sale.cufe.isnot(None)).limit(300)
    res = await session.execute(stmt)
    return res.scalars().all()
