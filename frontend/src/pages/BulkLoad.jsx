import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Download, Loader2 } from "lucide-react";

const TEMPLATE = "name,barcode,category,price,cost,stock,unit,tax_rate\nArroz Diana 500g,7702001010011,Granos,2500,1800,40,und,19\n";

function parseCSV(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cols = l.split(sep).map((c) => c.trim());
    const get = (k) => cols[header.indexOf(k)] ?? "";
    return {
      name: get("name") || get("nombre"),
      barcode: get("barcode") || get("codigo") || null,
      category: get("category") || get("categoria") || "General",
      price: Number(get("price") || get("precio") || 0),
      cost: Number(get("cost") || get("costo") || 0),
      stock: Number(get("stock") || 0),
      unit: get("unit") || get("unidad") || "und",
      tax_rate: Number(get("tax_rate") || get("iva") || 19),
    };
  }).filter((r) => r.name);
}

export default function BulkLoad() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseCSV(text);
    setRows(parsed);
    if (parsed.length === 0) toast.error("No se encontraron filas válidas");
    else toast.info(`${parsed.length} filas listas para importar`);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "plantilla_inventario.csv";
    a.click();
  };

  const importRows = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/products/bulk", rows);
      toast.success(`✅ ${data.created} creados · ${data.updated} actualizados`);
      setRows([]);
    } catch { toast.error("Error en la importación"); }
    finally { setLoading(false); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="bulk-load-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><FileSpreadsheet className="w-6 h-6 text-emerald-700" /> Carga Masiva de Inventario</h1>
        <p className="text-sm text-slate-500">Sube un CSV con tus productos. Columnas: name, barcode, category, price, cost, stock, unit, tax_rate.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">1. Archivo CSV</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={downloadTemplate} data-testid="download-template-btn"><Download className="w-4 h-4 mr-1" /> Descargar plantilla</Button>
          <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => fileRef.current?.click()} data-testid="upload-csv-btn">
            <Upload className="w-4 h-4 mr-1" /> Seleccionar CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} data-testid="csv-input" />
        </CardContent>
      </Card>
      {rows.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">2. Vista previa ({rows.length} filas)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="bg-slate-50"><tr className="text-left">
                  <th className="p-2">Nombre</th><th className="p-2">Código</th><th className="p-2">Categoría</th>
                  <th className="p-2 text-right">Precio</th><th className="p-2 text-right">Costo</th><th className="p-2 text-right">Stock</th>
                </tr></thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 font-mono text-xs">{r.barcode || "-"}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2 text-right font-mono">{r.price}</td>
                      <td className="p-2 text-right font-mono">{r.cost}</td>
                      <td className="p-2 text-right font-mono">{r.stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && <p className="text-xs text-slate-500 mt-2">...y {rows.length - 100} filas más</p>}
            </div>
            <Button className="bg-emerald-700 hover:bg-emerald-800 mt-3" onClick={importRows} disabled={loading} data-testid="import-bulk-btn">
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />} Importar {rows.length} productos
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
