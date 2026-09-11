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
