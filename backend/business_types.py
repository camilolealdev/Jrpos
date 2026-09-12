"""Catálogo de tipos de negocio del SaaS y su preset de módulos ocultos.

Única fuente de verdad del lado servidor -- el registro de tenant
(`auth.py::_provision_tenant`) siembra `SettingsGeneral.hidden_module_tids`
desde `HIDDEN_MODULES_BY_BUSINESS_TYPE` al crear la tienda. Después de eso,
el dueño lo edita libremente desde Configuración y deja de depender de este
mapa (es un preset inicial, no una regla permanente).
"""

BUSINESS_TYPES = ["abarrotes", "drogueria", "licorera", "ferreteria", "cafeteria", "ropa", "otro"]

# tids de nav (frontend/src/components/Layout.jsx) ocultos por defecto al
# crear un tenant de este tipo. Todos vacíos hoy -- editar aquí para
# pre-activar/desactivar módulos por vertical sin tocar el resto de la
# tubería (registro -> SettingsGeneral -> sidebar -> Configuración).
HIDDEN_MODULES_BY_BUSINESS_TYPE = {t: [] for t in BUSINESS_TYPES}

# Rol(es) operativo(s) de staff (no-admin) que se ofrecen al crear un usuario,
# según el rubro del tenant. Solo "mesero" tiene permisos distintos de verdad
# (oculta Reportes/Inventario/Gastos en Layout.jsx) -- el resto son el mismo
# "cajero" de siempre, solo cambia la etiqueta (ver STAFF_ROLE_LABELS abajo).
# Fijo por JRPOS, no editable por el admin del tenant.
STAFF_ROLES_BY_BUSINESS_TYPE = {
    "abarrotes": ["cajero"],
    "drogueria": ["cajero"],
    "licorera": ["cajero"],
    "ferreteria": ["cajero"],
    "cafeteria": ["mesero"],
    "ropa": ["cajero"],
    "otro": ["cajero"],
}

# Etiqueta a mostrar en la UI para un rol dado, por tipo de negocio. Los
# business_type que no aparecen (o roles no listados) usan el nombre genérico
# del rol tal cual (p.ej. "cajero" -> "Cajero").
STAFF_ROLE_LABELS_BY_BUSINESS_TYPE = {
    "drogueria": {"cajero": "Especialista de Turno"},
    "ferreteria": {"cajero": "Asesor de Ventas"},
    "ropa": {"cajero": "Vendedor"},
    "cafeteria": {"mesero": "Mesero"},
}
