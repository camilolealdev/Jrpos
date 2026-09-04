from typing import Optional, Tuple


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
