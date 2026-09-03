# 🏪 JRPOS — Arquitectura del Sistema

Sistema POS modular y responsivo para tiendas de abarrotes en Colombia.

```mermaid
graph TD
    subgraph Frontend [Frontend - React 19 + Tailwind CSS]
        UI[Vistas SPA / PWA]
        RBAC[Control de Acceso por Roles (Admin / Cajero)]
        POS_UI[POS Táctil & Carrito]
        CAM[html5-qrcode Escáner Cámara]
        BT[Impresión Térmica Web Bluetooth ESC/POS]
    end

    subgraph Backend [Backend - FastAPI REST API]
        AUTH[Auth JWT + Cookies httpOnly + Brute Force Lock]
        ROUTER_SALES[Ventas, Fiado & Held Accounts]
        ROUTER_INV[Inventario, Categorías & Bulk Upload]
        ROUTER_DIAN[Facturación Electrónica, Nómina & RADIAN Simulados]
        ROUTER_USERS[Gestión de Usuarios & Marcación]
        OCR_ENGINE[OCR Facturas Gemini Vision]
    end

    subgraph Storage [Persistencia & Servicios]
        MONGO[(MongoDB / Motor Async)]
        GEMINI_API[Google Gemini 3 Flash / 3.1 Pro via Emergent]
    end

    UI --> RBAC
    RBAC --> POS_UI
    POS_UI --> CAM
    POS_UI --> BT
    POS_UI --> ROUTER_SALES
    UI --> ROUTER_INV
    UI --> ROUTER_DIAN
    UI --> ROUTER_USERS
    UI --> AUTH

    AUTH --> MONGO
    ROUTER_SALES --> MONGO
    ROUTER_INV --> MONGO
    ROUTER_DIAN --> MONGO
    ROUTER_USERS --> MONGO
    ROUTER_INV --> OCR_ENGINE
    OCR_ENGINE --> GEMINI_API
```

---

## 🛡️ Matriz de Seguridad y Roles (RBAC)

| Módulo / Ruta | Cajero | Administrador | Notas |
|---|:---:|:---:|---|
| `/pos` (POS Venta) | ✅ | ✅ | Carrito, búsqueda, escaneo, retención y cobro |
| `/inventario` (Inventario) | ✅ | ✅ | Consulta y edición básica de stock |
| `/facturas` (Escanear Factura IA) | ✅ | ✅ | OCR de compras |
| `/clientes` & `/proveedores` | ✅ | ✅ | Gestión de contactos comerciales |
| `/creditos` (Fiado y Abonos) | ✅ | ✅ | Registro de abonos y estados de cuenta |
| `/marcacion` (Reloj Control) | ✅ (Solo personal) | ✅ (Todos + horario) | Control de asistencia |
| `/gastos` | ✅ | ✅ | Registro de salidas de caja |
| `/recogidas` (Caja y Arqueo) | ✅ (Caja propia) | ✅ (Historial global) | Arqueo ciego y diferencias |
| `/promociones` & `/carga-masiva` | ❌ | ✅ | Modificación masiva y políticas |
| Facturación DIAN (FE, Nómina, RADIAN, Certificado) | ❌ | ✅ | Documentos fiscales y llaves |
| `/usuarios` & `/configuracion` | ❌ | ✅ | Administración general |

---

## 📦 Gobernanza de Habilidades (SuperDuperSkills)
- **Suite Core**: Invocada para compresión de tokens (`caveman`), simplicidad (`ponytail`), validación continua (`harness`) y diagramación (`archify`).
- **Especializadas**: `fastapi-expert`, `python-patterns`, `react-patterns`, `tailwind-theme-builder`, `emil-design-eng`, `taste-skill`.
