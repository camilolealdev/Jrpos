import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Wallet } from "lucide-react";

const CATS = ["Arriendo", "Servicios", "Nómina", "Proveedores", "Transporte", "Mantenimiento", "Impuestos", "Otros"];
const empty = { concept: "", category: "Otros", amount: "", method: "efectivo", notes: "" };

export default function Expenses() {
  const [data, setData] = useState({ expenses: [], total: 0, today: 0, month: 0 });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setData((await api.get("/expenses")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.concept || Number(form.amount) <= 0) return toast.error("Concepto y monto válido requeridos");
    try {
      await api.post("/expenses", { ...form, amount: Number(form.amount) });
      toast.success("Gasto registrado");
      setOpen(false); setForm(empty); load();
    } catch { toast.error("Error"); }
  };
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar gasto?")) return;
    await api.delete(`/expenses/${id}`); toast.success("Eliminado"); load();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="expenses-page">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Wallet className="w-6 h-6 text-orange-600" /> Gastos y Pagos</h1>
          <p className="text-sm text-slate-500">Egresos de la tienda.</p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-expense-btn"><Plus className="w-4 h-4 mr-1" /> Nuevo gasto</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Hoy</div><div className="font-mono font-bold text-lg" data-testid="exp-today">{formatCOP(data.today)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Este mes</div><div className="font-mono font-bold text-lg" data-testid="exp-month">{formatCOP(data.month)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Total</div><div className="font-mono font-bold text-lg text-orange-700" data-testid="exp-total">{formatCOP(data.total)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Historial</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">Fecha</th><th className="p-3">Concepto</th><th className="p-3">Categoría</th>
                <th className="p-3">Método</th><th className="p-3 text-right">Monto</th><th></th>
              </tr></thead>
              <tbody>
                {data.expenses.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">Sin gastos registrados.</td></tr>
                ) : data.expenses.map((e) => (
                  <tr key={e.id} className="border-b hover:bg-slate-50">
                    <td className="p-3">{formatDate(e.created_at)}</td>
                    <td className="p-3 font-medium">{e.concept}</td>
                    <td className="p-3"><Badge variant="outline">{e.category}</Badge></td>
                    <td className="p-3 capitalize">{e.method}</td>
                    <td className="p-3 text-right font-mono font-bold text-orange-700">{formatCOP(e.amount)}</td>
                    <td className="p-3 text-right"><Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="expense-form">
          <DialogHeader><DialogTitle>Nuevo gasto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold">Concepto</label>
              <Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} data-testid="e-concept" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs font-semibold">Categoría</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="e-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><label className="text-xs font-semibold">Monto</label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="font-mono" data-testid="e-amount" /></div>
            </div>
            <div><label className="text-xs font-semibold">Método</label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger data-testid="e-method"><SelectValue /></SelectTrigger>
                <SelectContent>{["efectivo", "nequi", "daviplata", "transferencia", "tarjeta"].map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-expense-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
