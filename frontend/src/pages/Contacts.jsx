import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Users } from "lucide-react";

const empty = { kind: "customer", name: "", document: "", document_type: "CC", email: "", phone: "", address: "", city: "" };

export default function Contacts({ kind = "customer", title = "Clientes" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty, kind });
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/contacts", { params: { kind } });
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  }, [kind]);

  useEffect(() => {
    load();
  }, [load]);

  const safeItems = Array.isArray(items) ? items : [];

  const save = async () => {
    if (!form.name) return toast.error("El nombre es obligatorio");
    try {
      const payload = { ...form, kind };
      if (editingId) await api.put(`/contacts/${editingId}`, payload);
      else await api.post("/contacts", payload);
      toast.success("Guardado");
      setOpen(false); setForm({ ...empty, kind }); setEditingId(null); load();
    } catch { toast.error("Error"); }
  };

  const edit = (c) => { setForm(c); setEditingId(c.id); setOpen(true); };
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/contacts/${id}`);
    toast.success("Eliminado"); load();
  };

  return (
    <div className="p-4 lg:p-6" data-testid={kind === "customer" ? "clients-page" : "suppliers-page"}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-sm text-slate-500">{safeItems.length} registros</p>
        </div>
        <Button onClick={() => { setForm({ ...empty, kind }); setEditingId(null); setOpen(true); }} className="bg-emerald-700 hover:bg-emerald-800" data-testid={`new-${kind}-btn`}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo
        </Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">Nombre</th>
              <th className="p-3">Documento</th>
              <th className="p-3 hidden md:table-cell">Teléfono</th>
              <th className="p-3 hidden lg:table-cell">Ciudad</th>
              <th></th>
            </tr></thead>
            <tbody>
              {safeItems.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">
                  <Users className="w-8 h-8 mx-auto opacity-40" /><p className="mt-2">Sin registros.</p>
                </td></tr>
              ) : safeItems.map((c) => (
                <tr key={c.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 font-mono text-xs">{c.document_type} {c.document || "-"}</td>
                  <td className="p-3 hidden md:table-cell">{c.phone || "-"}</td>
                  <td className="p-3 hidden lg:table-cell">{c.city || "-"}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => edit(c)}><Edit2 className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Editar" : "Nuevo"} {kind === "customer" ? "cliente" : "proveedor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs font-semibold">Nombre / Razón social</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="c-name" /></div>
            <div><label className="text-xs font-semibold">Tipo doc.</label>
              <Input value={form.document_type} onChange={(e) => setForm({ ...form, document_type: e.target.value })} /></div>
            <div><label className="text-xs font-semibold">Documento / NIT</label>
              <Input value={form.document || ""} onChange={(e) => setForm({ ...form, document: e.target.value })} className="font-mono" /></div>
            <div><label className="text-xs font-semibold">Teléfono</label>
              <Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="text-xs font-semibold">Email</label>
              <Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs font-semibold">Dirección</label>
              <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><label className="text-xs font-semibold">Ciudad</label>
              <Input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-emerald-700 hover:bg-emerald-800" data-testid="save-contact-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
