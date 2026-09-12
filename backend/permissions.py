from typing import Set, Dict, List
from fastapi import Depends, HTTPException
from auth import get_current_user
from models_sql import User

# Catálogo exhaustivo de permisos atómicos del sistema
PERMISSIONS_CATALOG = {
    # Productos e Inventario
    "products:read": "Ver listado y detalle de productos",
    "products:create": "Crear nuevos productos",
    "products:update": "Modificar productos existentes",
    "products:delete": "Eliminar productos",
    "inventory:adjust": "Ajustar stock físico e inventario",
    "inventory:purchase": "Crear y recibir órdenes de compra",

    # Ventas, POS y Caja
    "sales:create": "Registrar ventas en POS y emitir comprobantes",
    "sales:read": "Consultar historial de ventas",
    "held:manage": "Guardar y recuperar cuentas pendientes / mesas",
    "cash:open": "Apertura de turno de caja",
    "cash:close": "Cierre de turno de caja (arqueo ciego)",
    "cash:pickup": "Realizar recogidas de efectivo en caja",
    "cash:read": "Consultar movimientos de caja y turnos",

    # Gastos y Promociones
    "expenses:read": "Ver listado de gastos y egresos",
    "expenses:create": "Registrar gastos operativos",
    "expenses:delete": "Eliminar registros de gastos",
    "promotions:read": "Consultar promociones y descuentos",
    "promotions:manage": "Crear, editar o eliminar promociones",

    # Clientes, Proveedores y Documentos
    "customers:read": "Ver directorio de clientes",
    "customers:manage": "Crear o actualizar datos de clientes",
    "suppliers:read": "Ver directorio de proveedores",
    "suppliers:manage": "Crear o actualizar proveedores",
    "docs:read": "Ver cotizaciones, remisiones y órdenes",
    "docs:manage": "Generar y convertir cotizaciones o remisiones",
    "credit_notes:read": "Ver notas crédito y devoluciones",
    "credit_notes:create": "Emitir notas crédito y devoluciones",
    "warranties:manage": "Gestionar garantías y servicio técnico",

    # Reportes y Nómina
    "reports:read": "Ver reportes operativos de ventas y productos",
    "reports:financial": "Ver reportes financieros, márgenes y utilidad",
    "payroll:read": "Consultar nómina",
    "payroll:create": "Generar liquidación de nómina",

    # Configuración, Usuarios y Facturación Electrónica (Demo)
    "settings:read": "Ver configuración general del comercio",
    "settings:manage": "Modificar configuración de tienda, impuestos e impresoras",
    "users:read": "Ver listado de usuarios del tenant",
    "users:manage": "Crear, modificar y desactivar usuarios",
    "invoices:ocr": "Escanear facturas con Inteligencia Artificial (OCR)",
    "electronic:manage": "Configurar y operar facturación electrónica DIAN (Demo)",
}

# Matriz de permisos asignados por rol
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "superadmin_platform": {"*"},
    "admin": {"*"},
    "supervisor": {
        "products:read",
        "products:create",
        "products:update",
        "inventory:adjust",
        "inventory:purchase",
        "sales:create",
        "sales:read",
        "held:manage",
        "cash:open",
        "cash:close",
        "cash:pickup",
        "cash:read",
        "promotions:read",
        "promotions:manage",
        "expenses:read",
        "expenses:create",
        "customers:read",
        "customers:manage",
        "suppliers:read",
        "suppliers:manage",
        "docs:read",
        "docs:manage",
        "credit_notes:read",
        "credit_notes:create",
        "warranties:manage",
        "reports:read",
        "settings:read",
        "users:read",
    },
    "cajero": {
        "products:read",
        "sales:create",
        "sales:read",
        "held:manage",
        "cash:open",
        "cash:close",
        "cash:pickup",
        "cash:read",
        "customers:read",
        "customers:manage",
        "docs:read",
        "warranties:manage",
    },
    "contador": {
        "sales:read",
        "products:read",
        "expenses:read",
        "docs:read",
        "credit_notes:read",
        "credit_notes:create",
        "reports:read",
        "reports:financial",
        "payroll:read",
        "payroll:create",
        "settings:read",
    },
    "mesero": {
        "products:read",
        "sales:create",
        "sales:read",
        "held:manage",
        "customers:read",
    },
    "tecnico": {
        "products:read",
        "sales:create",
        "sales:read",
        "customers:read",
        "warranties:manage",
    },
    "estilista": {
        "products:read",
        "sales:create",
        "sales:read",
        "customers:read",
    },
    "farmaceutico": {
        "products:read",
        "sales:create",
        "sales:read",
        "customers:read",
    },
    "mecanico": {
        "products:read",
        "sales:create",
        "sales:read",
        "customers:read",
        "warranties:manage",
    },
    "empleado": {
        "products:read",
        "sales:create",
        "sales:read",
        "customers:read",
    },
}


def has_permission(role: str, permission: str) -> bool:
    """Verifica si un rol posee el permiso especificado o comodín '*'."""
    if not role:
        return False
    perms = ROLE_PERMISSIONS.get(role.lower(), set())
    if "*" in perms:
        return True
    if permission in perms:
        return True
    # Soporte para comodín por categoría (ej: "products:*")
    category = permission.split(":")[0] if ":" in permission else ""
    if category and f"{category}:*" in perms:
        return True
    return False


def get_role_permissions(role: str) -> List[str]:
    """Retorna la lista de permisos para un rol (o catálogo completo si es admin/superadmin)."""
    if not role:
        return []
    perms = ROLE_PERMISSIONS.get(role.lower(), set())
    if "*" in perms:
        return list(PERMISSIONS_CATALOG.keys())
    return sorted(list(perms))


def require_permission(permission: str):
    """
    Dependencia de FastAPI para requerir un permiso granular.
    Lanza 403 Forbidden si el rol del usuario no tiene la autorización requerida.
    """
    async def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user.role, permission):
            raise HTTPException(
                status_code=403,
                detail=f"Permiso denegado: se requiere '{permission}'",
            )
        return user

    return dependency
