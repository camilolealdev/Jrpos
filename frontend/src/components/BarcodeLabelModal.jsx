import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCOP } from "@/lib/format";
import { Printer, Barcode, X } from "lucide-react";

// Generador visual simple de código de barras SVG tipo Code 128 / EAN simulado para etiquetas
function SvgBarcode({ code, height = 40 }) {
  if (!code) return null;
  // Genera un patrón determinista de barras a partir del string del código
  const bars = [];
  let currentX = 0;
  for (let i = 0; i < code.length; i++) {
    const charCode = code.charCodeAt(i);
    const pattern = [(charCode % 3) + 1, ((charCode >> 1) % 3) + 1, ((charCode >> 2) % 2) + 1];
    pattern.forEach((width, idx) => {
      if (idx % 2 === 0) {
        bars.push(<rect key={`${i}-${idx}`} x={currentX} y={0} width={width * 1.5} height={height} fill="black" />);
      }
      currentX += width * 1.5 + 1;
    });
  }

  return (
    <div className="flex flex-col items-center">
      <svg width={Math.max(120, currentX)} height={height} className="overflow-visible">
        {bars}
      </svg>
      <span className="font-mono text-xs tracking-widest mt-1 text-slate-800">{code}</span>
    </div>
  );
}

export default function BarcodeLabelModal({ open, onOpenChange, product }) {
  const [copies, setCopies] = useState(12);
  const [labelSize, setLabelSize] = useState("standard"); // 'standard' (hoja stickers) o 'thermal' (rollo)

  if (!product) return null;

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const itemsHtml = Array.from({ length: Number(copies) || 1 })
      .map(
        () => `
        <div class="label-card">
          <div class="store-name">JRPOS</div>
          <div class="prod-name">${product.name}</div>
          <div class="barcode-container">
            <div class="barcode-lines">|||||||||||||||||||||||||||||||||||||</div>
            <div class="barcode-num">${product.barcode || "SIN CÓDIGO"}</div>
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
            .barcode-lines { font-family: monospace; font-size: 20px; letter-spacing: -2px; font-weight: bold; line-height: 1; }
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
              <SvgBarcode code={product.barcode || "7702001000000"} />
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
