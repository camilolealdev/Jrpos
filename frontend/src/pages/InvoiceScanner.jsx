import { useRef, useState } from "react";
import { api, fileToBase64 } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Camera, Upload, Sparkles, Trash2, Plus, Loader2, Save, PenLine } from "lucide-react";

export default function InvoiceScanner() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [model, setModel] = useState("gemini-3-flash-preview");
  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState({ supplier_name: "", supplier_nit: "", invoice_number: "", date: "", items: [] });
  const fileRef = useRef(null);

  const onPick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      toast.error("Formato no soportado. Usa JPG, PNG o WEBP.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const runOCR = async () => {
    if (!file) return toast.error("Selecciona una imagen");
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const { data } = await api.post("/invoices/ocr", {
        image_base64: b64,
        mime_type: file.type,
        model,
      });
      setInvoice({
        supplier_name: data.supplier_name || "",
        supplier_nit: data.supplier_nit || "",
        invoice_number: data.invoice_number || "",
        date: data.date || "",
        items: (data.items || []).map((it) => ({
          name: it.name, barcode: it.barcode || "", quantity: it.quantity || 1,
          unit_price: it.unit_price || 0, selling_price: Math.round((it.unit_price || 0) * 1.3),
          category: "General", tax_rate: 19,
        })),
      });
      toast.success(`OCR completado · ${(data.items || []).length} ítems detectados`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al procesar imagen");
    } finally { setLoading(false); }
  };

  const updateItem = (i, key, val) => {
    setInvoice((prev) => {
      const items = [...prev.items];
      items[i] = { ...items[i], [key]: key === "name" || key === "barcode" || key === "category" ? val : Number(val || 0) };
      return { ...prev, items };
    });
  };
  const addRow = () => setInvoice((p) => ({ ...p, items: [...p.items, { name: "", barcode: "", quantity: 1, unit_price: 0, selling_price: 0, category: "General", tax_rate: 19 }] }));
  const removeRow = (i) => setInvoice((p) => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const importInv = async () => {
    if (invoice.items.length === 0) return toast.error("No hay ítems para importar");
    try {
      const { data } = await api.post("/invoices/import", invoice);
      toast.success(`✅ ${data.imported} nuevos · ${data.updated} actualizados`);
      setInvoice({ supplier_name: "", supplier_nit: "", invoice_number: "", date: "", items: [] });
      setFile(null); setPreview(null);
    } catch { toast.error("Error importando factura"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="invoice-scanner-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-amber-600" />
          Escanear Factura de Compra
        </h1>
        <p className="text-sm text-slate-500">Sube la foto de la factura o dígita manualmente. La IA extraerá los productos para agregarlos a tu inventario.</p>
      </div>

      <Tabs defaultValue="ocr">
        <TabsList>
          <TabsTrigger value="ocr" data-testid="tab-ocr"><Camera className="w-4 h-4 mr-1" /> Con foto (IA)</TabsTrigger>
          <TabsTrigger value="manual" data-testid="tab-manual"><PenLine className="w-4 h-4 mr-1" /> Manual</TabsTrigger>
        </TabsList>

        <TabsContent value="ocr" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-lg">1. Sube la foto de la factura</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div
                    className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-emerald-500 transition cursor-pointer bg-white"
                    onClick={() => fileRef.current?.click()}
                    data-testid="dropzone"
                  >
                    <Upload className="w-8 h-8 mx-auto text-slate-400" />
                    <p className="mt-2 font-semibold">Arrastra o haz clic para elegir</p>
                    <p className="text-xs text-slate-500">JPG · PNG · WEBP · Cámara móvil</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={onPick}
                      data-testid="file-input"
                    />
                  </div>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <Select value={model} onValueChange={setModel}>
                      <SelectTrigger className="flex-1" data-testid="model-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gemini-3-flash-preview">Gemini 3 Flash (económico)</SelectItem>
                        <SelectItem value="gemini-3.1-pro-preview">Gemini 3.1 Pro (más preciso)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      className="bg-emerald-700 hover:bg-emerald-800"
                      onClick={runOCR}
                      disabled={loading || !file}
                      data-testid="run-ocr-btn"
                    >
                      {loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Procesando...</> : <><Sparkles className="w-4 h-4 mr-1" /> Extraer con IA</>}
                    </Button>
                  </div>
                </div>
                <div className="min-h-[200px] rounded-lg border bg-slate-50 grid place-items-center overflow-hidden">
                  {preview ? (
                    <img src={preview} alt="preview" className="max-h-72 object-contain" data-testid="invoice-preview" />
                  ) : (
                    <div className="text-slate-400 text-sm">Vista previa de la factura</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual">
          <Card>
            <CardHeader><CardTitle className="text-lg">Ingreso manual</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-slate-500 mb-2">Completa los campos y agrega filas de productos abajo.</p></CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Header + items table */}
      <Card>
        <CardHeader><CardTitle className="text-lg">2. Revisa y ajusta los datos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div><label className="text-xs font-semibold">Proveedor</label>
              <Input value={invoice.supplier_name} onChange={(e) => setInvoice({ ...invoice, supplier_name: e.target.value })} data-testid="inv-supplier" /></div>
            <div><label className="text-xs font-semibold">NIT</label>
              <Input value={invoice.supplier_nit} onChange={(e) => setInvoice({ ...invoice, supplier_nit: e.target.value })} className="font-mono" /></div>
            <div><label className="text-xs font-semibold">N° Factura</label>
              <Input value={invoice.invoice_number} onChange={(e) => setInvoice({ ...invoice, invoice_number: e.target.value })} className="font-mono" /></div>
            <div><label className="text-xs font-semibold">Fecha</label>
              <Input type="date" value={invoice.date} onChange={(e) => setInvoice({ ...invoice, date: e.target.value })} /></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="text-left">
                  <th className="p-2">Producto</th>
                  <th className="p-2">Código</th>
                  <th className="p-2">Categoría</th>
                  <th className="p-2 text-right">Cant.</th>
                  <th className="p-2 text-right">Costo</th>
                  <th className="p-2 text-right">P. Venta</th>
                  <th className="p-2 text-right">Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.length === 0 ? (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-400">Sin ítems. Sube una factura o agrega manualmente.</td></tr>
                ) : invoice.items.map((it, i) => (
                  <tr key={i} className="border-b" data-testid={`item-row-${i}`}>
                    <td className="p-1"><Input value={it.name} onChange={(e) => updateItem(i, "name", e.target.value)} className="h-8" /></td>
                    <td className="p-1"><Input value={it.barcode} onChange={(e) => updateItem(i, "barcode", e.target.value)} className="h-8 font-mono" /></td>
                    <td className="p-1"><Input value={it.category} onChange={(e) => updateItem(i, "category", e.target.value)} className="h-8" /></td>
                    <td className="p-1"><Input type="number" value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} className="h-8 text-right font-mono w-20" /></td>
                    <td className="p-1"><Input type="number" value={it.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} className="h-8 text-right font-mono w-28" /></td>
                    <td className="p-1"><Input type="number" value={it.selling_price} onChange={(e) => updateItem(i, "selling_price", e.target.value)} className="h-8 text-right font-mono w-28" /></td>
                    <td className="p-1 text-right font-mono">{formatCOP(it.quantity * it.unit_price)}</td>
                    <td className="p-1"><Button size="icon" variant="ghost" onClick={() => removeRow(i)}><Trash2 className="w-4 h-4 text-red-600" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-2">
            <Button variant="outline" onClick={addRow} data-testid="add-row-btn"><Plus className="w-4 h-4 mr-1" /> Agregar ítem</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={importInv} disabled={invoice.items.length === 0} data-testid="import-invoice-btn">
              <Save className="w-4 h-4 mr-1" /> Confirmar e importar al inventario
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
