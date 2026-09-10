// Import explícito del build ESM: jspdf's "main" en package.json apunta a un
// bundle para Node.js que rompe el webpack de CRA con
// "Cannot read properties of undefined (reading 'call')" al cargar la ruta
// perezosa de SalesDocs.jsx. El build "module" (este) sí es un ES module real.
import { jsPDF } from "jspdf/dist/jspdf.es.min.js";
import { formatCOP, formatDate } from "./format";

const DOC_TITLES = {
  quotes: "Cotización",
  remissions: "Remisión de Entrega",
  collection_accounts: "Cuenta de Cobro",
};

function getStoreSettings() {
  try {
    return JSON.parse(localStorage.getItem("jrpos_settings") || "{}") || {};
  } catch {
    return {};
  }
}

// Genera y descarga un PDF vectorizado (texto real, no imagen) para
// cotizaciones, remisiones y cuentas de cobro, con membrete de la tienda.
// La tabla de items se dibuja a mano con primitivas de jsPDF (sin
// jspdf-autotable: su bundle precompilado trae IDs de módulo internos que
// chocan con el webpack de Create React App).
export function exportDocPdf(doc) {
  const settings = getStoreSettings();
  const title = DOC_TITLES[doc.kind] || "Documento";
  const pdf = new jsPDF({ unit: "mm", format: "letter" });
  const marginX = 15;
  const pageWidth = 215.9;
  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(settings.store_name || "JRPOS", marginX, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  y += 6;
  const storeLines = [
    settings.store_nit ? `NIT: ${settings.store_nit}` : null,
    [settings.store_address, settings.store_city].filter(Boolean).join(", ") || null,
    settings.support_phone ? `Tel: ${settings.support_phone}` : null,
  ].filter(Boolean);
  storeLines.forEach((l) => { pdf.text(l, marginX, y); y += 4.5; });

  y += 3;
  pdf.setDrawColor(200);
  pdf.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text(title, marginX, y);
  pdf.setFontSize(11);
  pdf.text(doc.number || "", pageWidth - marginX, y, { align: "right" });
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Fecha: ${formatDate(doc.created_at)}`, marginX, y);
  pdf.text(`Estado: ${doc.status || "-"}`, pageWidth - marginX, y, { align: "right" });
  y += 7;

  if (doc.customer_name) {
    pdf.setFont("helvetica", "bold");
    pdf.text("Cliente:", marginX, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(doc.customer_name, marginX + 18, y);
    y += 8;
  } else {
    y += 2;
  }

  const items = Array.isArray(doc.items) ? doc.items : [];
  if (items.length > 0) {
    const colProduct = marginX;
    const colQty = pageWidth - marginX - 60;
    const colPrice = pageWidth - marginX - 38;
    const colTotal = pageWidth - marginX;
    const rowHeight = 6.5;

    // Encabezado de la tabla
    pdf.setFillColor(16, 122, 87);
    pdf.rect(marginX, y - 4.5, pageWidth - marginX * 2, rowHeight, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Producto", colProduct + 2, y);
    pdf.text("Cant.", colQty, y, { align: "right" });
    pdf.text("Precio Unit.", colPrice, y, { align: "right" });
    pdf.text("Total", colTotal, y, { align: "right" });
    y += rowHeight;
    pdf.setTextColor(20, 20, 20);
    pdf.setFont("helvetica", "normal");

    items.forEach((it, i) => {
      if (y > 260) {
        pdf.addPage();
        y = 20;
      }
      if (i % 2 === 1) {
        pdf.setFillColor(245, 247, 246);
        pdf.rect(marginX, y - 4.5, pageWidth - marginX * 2, rowHeight, "F");
      }
      const lineTotal = (Number(it.qty) || 0) * (Number(it.price) || 0);
      const name = String(it.name || "").slice(0, 45);
      pdf.text(name, colProduct + 2, y);
      pdf.text(String(it.qty), colQty, y, { align: "right" });
      pdf.text(formatCOP(it.price), colPrice, y, { align: "right" });
      pdf.text(formatCOP(lineTotal), colTotal, y, { align: "right" });
      y += rowHeight;
    });

    pdf.setDrawColor(220);
    pdf.line(marginX, y - 2, pageWidth - marginX, y - 2);
    y += 6;
  } else {
    y += 3;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(`Total: ${formatCOP(doc.total ?? doc.amount)}`, pageWidth - marginX, y, { align: "right" });

  if (doc.notes) {
    y += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Notas: ${doc.notes}`, marginX, y);
  }

  pdf.save(`${title.replace(/\s+/g, "_")}_${doc.number || "documento"}.pdf`);
}
