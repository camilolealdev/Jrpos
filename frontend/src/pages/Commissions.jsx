import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, BadgeDollarSign } from "lucide-react";

export default function Commissions() {
  const [rules, setRules] = useState([]);
  const [report, setReport] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ user_name: "", percent: "" });

  const load = async () => {
    const [r, rep] = await Promise.all([api.get("/commissions/rules"), api.get("/commissions/report")]);
    setRules(r.data); setReport(rep.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.user_name || !form.percent) return toast.error("Completa vendedor y %");
    try {
      await api.post("/commissions/rules", { ...form, percent: Number(form.percent) });
      toast.success("Regla creada"); setOpen(false); setForm({ user_name: "", percent: "" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };
  const remove = async (id) => { await api.delete(`/commissions/rules/${id}`); load(); };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl" data-testid="commissions-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><BadgeDollarSign className="w-6 h-6 text-emerald-700" /> Comisiones por Vendedor</h1>
          <p className="text-sm text-slate-500">% sobre las ventas registradas por cada cajero en el POS.</p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-rule-btn"><Plus className="w-4 h-4 mr-1" /> Nueva regla</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Liquidación (ventas × %)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">Vendedor</th><th className="p-3 text-right">Ventas</th><th className="p-3 text-right">%</th><th className="p-3 text-right">Comisión</th>
            </tr></thead>
            <tbody>
              {report.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-slate-400">Sin reglas de comisión.</td></tr>
              : report.map((r) => (
                <tr key={r.user_name} className="border-b" data-testid={`comm-${r.user_name}`}>
                  <td className="p-3 font-medium">{r.user_name}</td>
                  <td className="p-3 text-right font-mono">{formatCOP(r.sales_total)}</td>
                  <td className="p-3 text-right font-mono">{r.percent}%</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCOP(r.commission)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Reglas activas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="flex justify-between items-center text-sm border rounded-lg p-2.5">
              <span><b>{r.user_name}</b> — {r.percent}% de sus ventas</span>
              <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="rule-form">
          <DialogHeader><DialogTitle>Nueva regla de comisión</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold">Vendedor (nombre exacto del usuario)</label>
              <Input value={form.user_name} onChange={(e) => setForm({ ...form, user_name: e.target.value })} placeholder="Ej: Cajero Demo" data-testid="r-name" /></div>
            <div><label className="text-xs font-semibold">Porcentaje (%)</label>
              <Input type="number" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} className="font-mono" data-testid="r-percent" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-rule-btn">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
