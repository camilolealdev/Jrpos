import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Receipt, Save, FileCode2, AlertTriangle } from "lucide-react";

const emptySettings = { nit: "", razon_social: "", resolucion: "", prefijo: "FE", rango_desde: 1, rango_hasta: 999999, fecha_resolucion: "" };

export default function ElectronicPOS() {
  const [settings, setSettings] = useState(emptySettings);
  const [sales, setSales] = useState([]);
  const [saleId, setSaleId] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.get("/electronic/settings")
      .then((r) => setSettings(r.data && typeof r.data === "object" ? { ...emptySettings, ...r.data } : emptySettings))
      .catch(() => {});
    api.get("/sales")
      .then((r) => setSales(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSales([]));
  }, []);

  const safeSales = Array.isArray(sales) ? sales : [];

  const saveSettings = async () => {
    await api.put("/electronic/settings", settings);
    toast.success("Configuración guardada");
  };

  const generate = async () => {
    if (!saleId) return toast.error("Selecciona una venta");
    try {
      const { data } = await api.get(`/electronic/invoice/${saleId}`);
      setResult(data);
      toast.success(`Documento ${data.number} generado (SIMULADO)`);
    } catch { toast.error("Error generando documento"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="electronic-pos-page">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6 text-emerald-700" /> Facturación POS Electrónica</h1>
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 text-[11px] font-bold">
            PRÓXIMO LANZAMIENTO (DEMO)
          </Badge>
        </div>
        <p className="text-sm text-amber-700 flex items-center gap-1 mt-1"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> Modo SIMULADO: Estructura UBL 2.1 y CUFE sintético para prueba. La transmisión real DIAN estará disponible en el próximo lanzamiento.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Datos del emisor (resolución DIAN)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className="text-xs font-semibold">NIT</label><Input value={settings.nit} onChange={(e) => setSettings({ ...settings, nit: e.target.value })} className="font-mono" data-testid="el-nit" /></div>
          <div><label className="text-xs font-semibold">Razón social</label><Input value={settings.razon_social} onChange={(e) => setSettings({ ...settings, razon_social: e.target.value })} data-testid="el-razon" /></div>
          <div><label className="text-xs font-semibold">Resolución N°</label><Input value={settings.resolucion} onChange={(e) => setSettings({ ...settings, resolucion: e.target.value })} className="font-mono" /></div>
          <div><label className="text-xs font-semibold">Fecha resolución</label><Input type="date" value={settings.fecha_resolucion} onChange={(e) => setSettings({ ...settings, fecha_resolucion: e.target.value })} /></div>
          <div><label className="text-xs font-semibold">Prefijo</label><Input value={settings.prefijo} onChange={(e) => setSettings({ ...settings, prefijo: e.target.value })} className="font-mono" /></div>
          <div><label className="text-xs font-semibold">Rango desde</label><Input type="number" value={settings.rango_desde} onChange={(e) => setSettings({ ...settings, rango_desde: Number(e.target.value) })} /></div>
          <div><label className="text-xs font-semibold">Rango hasta</label><Input type="number" value={settings.rango_hasta} onChange={(e) => setSettings({ ...settings, rango_hasta: Number(e.target.value) })} /></div>
          <div className="flex items-end"><Button className="bg-emerald-700 hover:bg-emerald-800 w-full" onClick={saveSettings} data-testid="el-save-btn"><Save className="w-4 h-4 mr-1" /> Guardar</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Generar documento electrónico desde una venta POS</CardTitle></CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Select value={saleId} onValueChange={setSaleId}>
            <SelectTrigger className="flex-1" data-testid="el-sale-select"><SelectValue placeholder="Selecciona una venta..." /></SelectTrigger>
            <SelectContent>
              {safeSales.map((s) => <SelectItem key={s.id} value={s.id}>{s.number} · {formatDate(s.created_at)} · {formatCOP(s.total)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={generate} data-testid="el-generate-btn"><FileCode2 className="w-4 h-4 mr-1" /> Generar XML + CUFE</Button>
        </CardContent>
      </Card>

      {result && (
        <Card data-testid="el-result">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              Documento {result.number}
              <Badge className="bg-amber-100 text-amber-800 border-amber-200" variant="outline">SIMULADA</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500">CUFE</div>
              <div className="font-mono text-xs break-all bg-slate-100 p-2 rounded" data-testid="el-cufe">{result.cufe}</div>
            </div>
            <div>
              <div className="text-xs uppercase font-semibold text-slate-500">XML (UBL 2.1 simplificado)</div>
              <pre className="font-mono text-xs bg-slate-900 text-emerald-300 p-3 rounded overflow-x-auto max-h-72" data-testid="el-xml">{result.xml}</pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
