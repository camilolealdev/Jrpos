import { Store, Pill, Martini, Hammer, Coffee, Shirt, MoreHorizontal } from "lucide-react";

// Tipos de negocio soportados por el onboarding (registro por email y por
// Google usan este mismo catálogo). Único origen de verdad en el frontend --
// evita que los selects de cada formulario se desincronicen entre sí.
export const BUSINESS_TYPES = [
  { id: "abarrotes", label: "Tienda de Abarrotes / Minimercado", icon: Store },
  { id: "drogueria", label: "Droguería / Farmacia", icon: Pill },
  { id: "licorera", label: "Licorera / Bar / Estanco", icon: Martini },
  { id: "ferreteria", label: "Ferretería / Materiales", icon: Hammer },
  { id: "cafeteria", label: "Cafetería / Panadería / Restaurante", icon: Coffee },
  { id: "ropa", label: "Boutique / Ropa y Calzado", icon: Shirt },
  { id: "otro", label: "Otro Comercio Minorista", icon: MoreHorizontal },
];

// Módulos de la sidebar (por data-testid) que tiene sentido ocultar según la
// cultura del negocio -- catálogo usado por la sección "Módulos visibles" de
// Configuración. No incluye el core (POS, Inventario, Dashboard, Usuarios,
// Configuración, Soporte) ni la suite DIAN/Facturación Electrónica.
export const HIDEABLE_MODULES = [
  { tid: "nav-creditos", label: "Créditos (Fiado)" },
  { tid: "nav-comisiones", label: "Comisiones por vendedor" },
  { tid: "nav-servicios", label: "Servicios (Recargas/Corresponsal)" },
  { tid: "nav-garantias", label: "Garantías y Devoluciones" },
  { tid: "nav-ordenes-compra", label: "Órdenes de Compra" },
  { tid: "nav-ordenes-venta", label: "Órdenes de Venta / Cotizaciones" },
  { tid: "nav-promociones", label: "Promociones y Ofertas" },
];
