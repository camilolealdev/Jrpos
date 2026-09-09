export const BILLING_PERIODS = [
  { id: "monthly", label: "Mensual", months: 1 },
  { id: "quarterly", label: "Trimestral", months: 3 },
  { id: "annual", label: "Anual", months: 12 },
];

const PRICE_FIELD = {
  monthly: "price_cop",
  quarterly: "price_quarterly_cop",
  annual: "price_annual_cop",
};

export function periodPrice(plan, period) {
  return plan?.[PRICE_FIELD[period] || "price_cop"] || 0;
}

// % de ahorro del precio del periodo vs. pagar ese mismo número de meses al precio mensual.
export function periodSavingsPct(plan, period) {
  const info = BILLING_PERIODS.find((p) => p.id === period);
  if (!info || info.months === 1 || !plan?.price_cop) return 0;
  const total = periodPrice(plan, period);
  if (!total) return 0;
  const fullPrice = plan.price_cop * info.months;
  if (fullPrice <= 0) return 0;
  return Math.max(0, Math.round((1 - total / fullPrice) * 100));
}

export const copyToClipboard = async (text, label, toast) => {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("No se pudo copiar. Copia el dato manualmente.");
  }
};
