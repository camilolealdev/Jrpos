from datetime import datetime, timezone
from typing import Dict, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


def compute_unit_pricing(
    package_cost: Optional[float],
    units_per_package: Optional[float],
    margin_percent: Optional[float],
    fallback_cost: Optional[float] = None,
    fallback_price: Optional[float] = None,
    explicit_price: Optional[float] = None,
) -> Tuple[Optional[float], Optional[float]]:
    """Costo/precio por unidad a partir de costo del paquete + unidades por paquete + % de utilidad.

    cost = package_cost / units_per_package  (o fallback_cost si no hay package_cost)

    Prioridad del precio (el usuario siempre puede digitar el precio final y se respeta):
      1. explicit_price (> 0)          -> gana siempre, aunque haya margin_percent
      2. unit_cost * (1 + margin/100)  -> si hay margin_percent y se pudo calcular el costo
      3. fallback_price                -> tal cual, sin recalcular
    """
    upp = units_per_package if units_per_package and units_per_package > 0 else 1.0

    if package_cost is not None:
        unit_cost = round(package_cost / upp, 4)
    else:
        unit_cost = fallback_cost

    if explicit_price is not None and explicit_price > 0:
        unit_price = explicit_price
    elif unit_cost is not None and margin_percent is not None:
        unit_price = round(unit_cost * (1 + margin_percent / 100.0), 2)
    else:
        unit_price = fallback_price

    return unit_cost, unit_price


async def resolve_price_list_overrides(
    session: AsyncSession,
    tenant_id: str,
    contact_id: Optional[str],
) -> Dict[str, float]:
    """Precios por producto (product_id -> price) de la lista de precios asignada
    a un cliente (Contact.price_list_id), si esa lista existe, está activa y —
    igual que Promotion.start/end — cae dentro de su ventana de fechas (sin hora
    del día; ver nota en routers/price_lists.py sobre el alcance de esta feature).

    Devuelve {} (sin overrides -> el caller debe usar Product.price tal cual)
    cuando no hay contact_id, el contacto no existe o no es del tenant, no tiene
    lista asignada, o la lista asignada no aplica hoy.
    """
    if not contact_id:
        return {}

    # Import perezoso para evitar un ciclo: models_sql no importa pricing, pero
    # mantenemos este módulo libre de dependencias de modelos en su import top-level.
    from models_sql import Contact, PriceList, PriceListItem

    contact = await session.get(Contact, contact_id)
    if not contact or contact.tenant_id != tenant_id or not contact.price_list_id:
        return {}

    price_list = await session.get(PriceList, contact.price_list_id)
    if not price_list or price_list.tenant_id != tenant_id or not price_list.active:
        return {}

    today = datetime.now(timezone.utc).date().isoformat()
    if price_list.start and price_list.start > today:
        return {}
    if price_list.end and price_list.end < today:
        return {}

    rows = (
        await session.execute(
            select(PriceListItem.product_id, PriceListItem.price).where(
                PriceListItem.price_list_id == price_list.id
            )
        )
    ).all()
    return {row[0]: float(row[1]) for row in rows}


async def get_effective_price(
    session: AsyncSession,
    tenant_id: str,
    product_id: str,
    contact_id: Optional[str],
    fallback_price: float,
) -> float:
    """Precio final para un producto dado un cliente opcional: el override de su
    lista de precios si aplica, o fallback_price (normalmente Product.price)."""
    overrides = await resolve_price_list_overrides(session, tenant_id, contact_id)
    return overrides.get(product_id, fallback_price)
