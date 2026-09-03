import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Percent, Tag } from "lucide-react";

const empty = { name: "", type: "percent_all", value: "", category: "", start: "", end: "" };

export default function Promotions() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api.get("/promotions"), api.get("/categories")]);
      setItems(p.data); setCats(c.data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name || !form.value) return toast.error("Nombre y valor requeridos");
    try {
      await api.post("/promotions", { ...form, value: Number(form.value), category: form.type === "percent_category" ? form.category : null });
      toast.success("Promoción creada"); setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };
  const toggle = async (p) => { await api.put(`/promotions/${p.id}`, { active: !p.active }); load(); };
  const remove = async (id) => { if (window.confirm("¿Eliminar?")) { await api.delete(`/promotions/${id}`); load(); } };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="promotions-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Percent className="w-6 h-6 text-emerald-700" /> Promociones y Descuentos</h1>
          <p className="text-sm text-slate-500">Se aplican automáticamente al cobrar en el POS.</p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-promo-btn"><Plus className="w-4 h-4 mr-1" /> Nueva promo</Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.length === 0 && <p className="text-slate-400 col-span-3 p-6 text-center">Sin promociones. Crea la primera (ej: 10% en Granos).</p>}
        {items.map((p) => (
          <Card key={p.id} data-testid={`promo-${p.id}`} className={!p.active ? "opacity-60" : ""}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 grid place-items-center"><Tag className="w-4 h-4" /></div>
                  <div className="font-semibold text-sm">{p.name}</div>
                </div>
                <Badge variant="outline" className={p.active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : ""}>{p.active ? "Activa" : "Inactiva"}</Badge>
              </div>
              <div className="text-sm text-slate-600">
                {p.type === "percent_all" ? `${p.value}% en toda la tienda` : `${p.value}% en categoría "${p.category}"`}
              </div>
              {(p.start || p.end) && <div className="text-xs text-slate-400 font-mono">{p.start || "..."} → {p.end || "..."}</div>}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => toggle(p)} data-testid={`toggle-${p.id}`}>{p.active ? "Desactivar" : "Activar"}</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="promo-form">
          <DialogHeader><DialogTitle>Nueva promoción</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold">Nombre</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Semana del grano" data-testid="p-name" /></div>
            <div><label className="text-xs font-semibold">Tipo</label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger data-testid="p-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent_all">% Descuento en toda la tienda</SelectItem>
                  <SelectItem value="percent_category">% Descuento por categoría</SelectItem>
                </SelectContent>
              </Select></div>
            {form.type === "percent_category" && (
              <div><label className="text-xs font-semibold">Categoría</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="p-category"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{cats.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select></div>
            )}
            <div><label className="text-xs font-semibold">Descuento (%)</label>
              <Input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="font-mono" data-testid="p-value" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs font-semibold">Desde (opcional)</label>
                <Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
              <div><label className="text-xs font-semibold">Hasta (opcional)</label>
                <Input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-promo-btn">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
