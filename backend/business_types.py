"""Catálogo de tipos de negocio del SaaS y su preset de módulos ocultos.

Única fuente de verdad del lado servidor -- el registro de tenant
(`auth.py::_provision_tenant`) siembra `SettingsGeneral.hidden_module_tids`
desde `HIDDEN_MODULES_BY_BUSINESS_TYPE` al crear la tienda. Después de eso,
el dueño lo edita libremente desde Configuración y deja de depender de este
mapa (es un preset inicial, no una regla permanente).
"""

BUSINESS_TYPES = [
    "abarrotes", "drogueria", "licorera", "bar", "restaurante", "ferreteria", "cafeteria", "ropa", "otro",
]

# Módulos de la sidebar que se pueden ocultar (mismo catálogo que HIDEABLE_MODULES en
# frontend/src/lib/businessTypes.js; un test verifica que no se desincronicen). El núcleo
# (POS, Inventario, Panel, Caja, Usuarios, Configuración, Soporte) y la suite DIAN no se ocultan.
HIDEABLE_MODULE_TIDS = (
    "nav-creditos",        # Fiados
    "nav-comisiones",
    "nav-servicios",       # Recargas / corresponsal
    "nav-garantias",
    "nav-ordenes-compra",
    "nav-ordenes-venta",   # Cotizaciones
    "nav-promociones",
)

# tids de nav (frontend/src/components/Layout.jsx) ocultos por defecto al crear un tenant
# de este tipo. Solo se pueden ocultar los de HIDEABLE_MODULE_TIDS; el dueño lo cambia luego
# desde Configuración. Fiados queda visible en licorera, bar y restaurante.
_NO_FIADOS = [t for t in HIDEABLE_MODULE_TIDS if t != "nav-creditos"]

HIDDEN_MODULES_BY_BUSINESS_TYPE = {
    "abarrotes": ["nav-comisiones", "nav-ordenes-venta"],
    "drogueria": ["nav-comisiones", "nav-servicios", "nav-ordenes-venta"],
    "licorera": ["nav-comisiones", "nav-servicios", "nav-garantias", "nav-ordenes-venta"],
    # Bar y restaurante: POS con cuentas, Panel, Inventario, DIAN, Caja por turnos y Fiados.
    "bar": list(_NO_FIADOS),
    "restaurante": list(_NO_FIADOS),
    "ferreteria": ["nav-comisiones", "nav-servicios"],
    "cafeteria": ["nav-creditos", "nav-comisiones", "nav-servicios", "nav-garantias", "nav-ordenes-venta"],
    "ropa": ["nav-creditos", "nav-servicios"],
    "otro": [],
}

# Rol(es) operativo(s) de staff (no-admin) que se ofrecen al crear un usuario,
# según el rubro del tenant. Solo "mesero" tiene permisos distintos de verdad
# (oculta Reportes/Inventario/Gastos en Layout.jsx) -- el resto son el mismo
# "cajero" de siempre, solo cambia la etiqueta (ver STAFF_ROLE_LABELS abajo).
# Fijo por JRPOS, no editable por el admin del tenant.
STAFF_ROLES_BY_BUSINESS_TYPE = {
    "abarrotes": ["cajero"],
    "drogueria": ["cajero"],
    "licorera": ["cajero"],
    "bar": ["cajero"],
    "restaurante": ["cajero"],
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
