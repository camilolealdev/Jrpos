import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCOP } from "@/lib/format";
import { Printer, Barcode, X } from "lucide-react";

// Elige la simbología real según la forma del código: EAN-13/EAN-8/UPC exigen
// una cantidad exacta de dígitos y checksum válido; CODE128 acepta cualquier
// texto y es el fallback universal (SKUs alfanuméricos, códigos internos, etc.)
function pickBarcodeFormat(code) {
  if (/^\d{13}$/.test(code)) return "EAN13";
  if (/^\d{12}$/.test(code)) return "UPC";
  if (/^\d{8}$/.test(code)) return "EAN8";
  return "CODE128";
}

// Renderiza un código de barras real (Code128/EAN/UPC) con jsbarcode.
// Si el formato detectado falla (ej. dígitos con checksum EAN inválido),
// reintenta con CODE128 en vez de mostrar una gráfica rota o falsa.
function RealBarcode({ code, height = 50 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!code || !svgRef.current) return;
    const opts = { height, displayValue: true, fontSize: 13, margin: 6, background: "#ffffff" };
    try {
      JsBarcode(svgRef.current, code, { ...opts, format: pickBarcodeFormat(code) });
    } catch {
      try {
        JsBarcode(svgRef.current, code, { ...opts, format: "CODE128" });
      } catch { /* código con caracteres no soportados ni por CODE128 */ }
    }
  }, [code, height]);

  if (!code) return null;
  return <svg ref={svgRef} className="max-w-full" />;
}

export default function BarcodeLabelModal({ open, onOpenChange, product }) {
  const [copies, setCopies] = useState(12);
  const [labelSize, setLabelSize] = useState("standard"); // 'standard' (hoja stickers) o 'thermal' (rollo)

  if (!product) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    // Renderiza el código real UNA vez a PNG (offscreen canvas) y lo reusa en
    // todas las copias — todas comparten el mismo producto/código.
    const code = product.barcode || "";
    let barcodeImg = "";
    if (code) {
      const canvas = document.createElement("canvas");
      try {
        JsBarcode(canvas, code, { format: pickBarcodeFormat(code), height: 45, displayValue: false, margin: 4 });
        barcodeImg = canvas.toDataURL("image/png");
      } catch {
        try {
          JsBarcode(canvas, code, { format: "CODE128", height: 45, displayValue: false, margin: 4 });
          barcodeImg = canvas.toDataURL("image/png");
        } catch { /* código con caracteres no representables: se imprime solo el texto */ }
      }
    }
    const barcodeHtml = barcodeImg ? `<img class="barcode-img" src="${barcodeImg}" alt="${code}" />` : "";

    const itemsHtml = Array.from({ length: Number(copies) || 1 })
      .map(
        () => `
        <div class="label-card">
          <div class="store-name">JRPOS</div>
          <div class="prod-name">${product.name}</div>
          <div class="barcode-container">
            ${barcodeHtml}
            <div class="barcode-num">${code || "SIN CÓDIGO"}</div>
          </div>
          <div class="prod-price">${formatCOP(product.price)}</div>
        </div>
      `
      )
      .join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Etiquetas - ${product.name}</title>
          <style>
            @page { size: auto; margin: 8mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 0; }
            .grid-container {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(50mm, 1fr));
              gap: 4mm;
            }
            .label-card {
              border: 1px dashed #ccc;
              border-radius: 4px;
              padding: 4mm;
              text-align: center;
              page-break-inside: avoid;
              background: white;
            }
            .store-name { font-size: 8px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
            .prod-name { font-size: 11px; font-weight: bold; margin: 2px 0; max-height: 28px; overflow: hidden; }
            .barcode-img { max-width: 100%; height: 45px; }
            .barcode-num { font-family: monospace; font-size: 10px; margin-top: 1px; }
            .prod-price { font-size: 14px; font-weight: bold; color: #15803d; margin-top: 3px; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="grid-container">
            ${itemsHtml}
          </div>
          <script>
            window.onload = () => { window.print(); window.close(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="barcode-label-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-emerald-700" /> Imprimir Etiquetas de Código de Barras
          </DialogTitle>
          <DialogDescription>Genera e imprime tiras o planillas de etiquetas adhesivas para tus productos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          {/* Vista previa de la etiqueta */}
          <div className="border border-emerald-300 rounded-lg p-4 bg-emerald-50/40 text-center shadow-sm">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">JRPOS</div>
            <div className="font-bold text-sm text-slate-900 mt-0.5">{product.name}</div>
            <div className="my-2 flex justify-center">
              {product.barcode ? (
                <RealBarcode code={product.barcode} />
              ) : (
                <span className="text-xs text-amber-600 font-medium py-3">
                  Este producto no tiene código de barras asignado
                </span>
              )}
            </div>
            <div className="font-mono font-bold text-lg text-emerald-700">{formatCOP(product.price)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Número de copias</label>
              <Input
                type="number"
                min="1"
                max="100"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Formato</label>
              <select
                value={labelSize}
                onChange={(e) => setLabelSize(e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm bg-white border border-slate-200 rounded-md mt-1"
              >
                <option value="standard">Hoja adhesiva / A4</option>
                <option value="thermal">Rollo térmico continuo</option>
              </select>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="w-4 h-4 mr-1" /> Cerrar
          </Button>
          <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={handlePrint} data-testid="print-labels-btn">
            <Printer className="w-4 h-4 mr-1.5" /> Imprimir {copies} etiquetas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
