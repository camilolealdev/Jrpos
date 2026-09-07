import { Store, Martini, UtensilsCrossed } from "lucide-react";

// Tipos de negocio soportados. Este ajuste solo controla qué módulos de la
// barra lateral se muestran (gating), no cambia el modelo de datos ni agrega
// funcionalidades nuevas por tipo de negocio.
export const BUSINESS_TYPES = [
  { id: "abarrotes", label: "Tienda / Abarrotes", icon: Store },
  { id: "bar", label: "Bar", icon: Martini },
  { id: "restaurante", label: "Restaurante", icon: UtensilsCrossed },
];

// Módulos de la sidebar (por data-testid) que se ocultan según el tipo de
// negocio. "Créditos (Fiado)" es una práctica cultural de tienda de barrio,
// no aplica a bares/restaurantes.
export const HIDDEN_MODULE_TIDS_BY_TYPE = {
  abarrotes: [],
  bar: ["nav-creditos"],
  restaurante: ["nav-creditos"],
};
