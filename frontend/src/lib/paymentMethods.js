// Métodos de pago personalizables por tenant (Configuración > POS). Estos 6
// ids son los mismos que estaban hardcodeados en POS.jsx y ya existen como
// Sale.payment_method en ventas históricas de todos los tenants -- NUNCA
// deben renombrarse, solo su "label" visible es editable. Debe reflejar
// exactamente _default_custom_payment_methods() en backend/routers/settings.py.
export const DEFAULT_PAYMENT_METHODS = [
  { id: "efectivo", label: "Efectivo", active: true, sort_order: 0 },
  { id: "nequi", label: "Nequi", active: true, sort_order: 1 },
  { id: "daviplata", label: "Daviplata", active: true, sort_order: 2 },
  { id: "tarjeta", label: "Tarjeta", active: true, sort_order: 3 },
  { id: "transferencia", label: "Transferencia", active: true, sort_order: 4 },
  { id: "credito", label: "Crédito", active: true, sort_order: 5 },
];

// Tope de longitud del id-slug generado. Sale.payment_method / Payment.method
// son VARCHAR(40) en el backend (ver models_sql.py) -- se deja margen para el
// sufijo de desambiguación ("_2", "_3"...) sin arriesgar truncamiento.
const MAX_SLUG_LENGTH = 30;

// Convierte un label ("Bancolombia a la Mano") en un id slug estable
// ("bancolombia_a_la_mano"), evitando colisiones con ids ya usados.
export function slugifyPaymentId(label, existingIds = []) {
  const base =
    (label || "")
      .normalize("NFD")
      // eslint-disable-next-line no-misleading-character-class
      .replace(new RegExp("[̀-ͯ]", "g"), "") // quita tildes (marcas diacriticas combinantes)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, MAX_SLUG_LENGTH)
      .replace(/_+$/g, "") || "metodo";

  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

// Dado el objeto de storeSettings (respuesta de GET /settings/general),
// retorna la lista de métodos de pago activos, ordenados por sort_order.
// Si el tenant no ha personalizado nada (lista ausente o vacía) cae a los 6
// predeterminados de siempre -- así el POS nunca queda sin botones de pago.
export function getActivePaymentMethods(storeSettings) {
  const list = Array.isArray(storeSettings?.custom_payment_methods)
    ? storeSettings.custom_payment_methods
    : [];
  const source = list.length > 0 ? list : DEFAULT_PAYMENT_METHODS;
  return source
    .filter((m) => m && m.active !== false)
    .slice()
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}
