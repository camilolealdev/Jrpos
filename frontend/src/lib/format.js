export const formatCOP = (n) => {
  const v = Number(n || 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(v);
};

// Normaliza teléfono colombiano a formato wa.me (solo dígitos, código país 57)
export function whatsappUrl(phone, text) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) digits = "57" + digits;
  if (digits.length < 12) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const formatDate = (iso) => {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
};
