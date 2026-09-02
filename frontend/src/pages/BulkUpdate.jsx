import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";

export default function BulkUpdate() {
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState("all");
  const [mode, setMode] = useState("percent_price");
  const [value, setValue] = useState("");
  const [affected, setAffected] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api.get("/categories").then((r) => setCategories(r.data)); }, []);
  useEffect(() => {
    const params = category === "all" ? {} : { category };
    api.get("/products", { params: { ...params, limit: 5000 } }).then((r) => setAffected(r.data.length));
  }, [category]);

  const apply = async () => {
    const v = Number(value || 0);
    const payload = { category: category === "all" ? undefined : category };
    payload[mode] = v;
    setLoading(true);
    try {
      const { data } = await api.post("/products/bulk-update", payload);
      toast.success(`✅ ${data.updated} productos actualizados`);
    } catch { toast.error("Error en la actualización"); }
    finally { setLoading(false); }
  };

  const MODES = [
    { k: "percent_price", label: "Subir/bajar PRECIO en %", hint: "Ej: 10 sube 10%, -5 baja 5%" },
    { k: "percent_cost", label: "Subir/bajar COSTO en %", hint: "Ej: 8 sube 8%" },
    { k: "set_tax", label: "Fijar IVA (%)", hint: "Ej: 19, 8, 5, 0" },
    { k: "add_stock", label: "Sumar/restar STOCK", hint: "Ej: 10 suma, -3 resta" },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="bulk-update-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><RefreshCw className="w-6 h-6 text-emerald-700" /> Actualización Masiva</h1>
        <p className="text-sm text-slate-500">Modifica precios, costos, IVA o stock de muchos productos a la vez.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Configura el cambio</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold">Categoría afectada</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="bu-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-slate-500 mt-1" data-testid="bu-affected">{affected ?? 0} productos serán afectados</div>
          </div>
          <div>
            <label className="text-xs font-semibold">Tipo de cambio</label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger data-testid="bu-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODES.map((m) => <SelectItem key={m.k} value={m.k}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-slate-500 mt-1">{MODES.find((m) => m.k === mode)?.hint}</div>
          </div>
          <div>
            <label className="text-xs font-semibold">Valor</label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" data-testid="bu-value" />
            <Button className="bg-emerald-700 hover:bg-emerald-800 mt-2 w-full" onClick={apply} disabled={loading || value === ""} data-testid="bu-apply-btn">
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} Aplicar a {affected ?? 0} productos
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
