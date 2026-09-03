import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Search, Package, Tags } from "lucide-react";
import CategoryManager from "@/components/CategoryManager";

const empty = { name: "", barcode: "", category: "General", price: 0, cost: 0, stock: 0, unit: "und", tax_rate: 19 };

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/products", { params: { q: q || undefined } });
    setItems(data);
  }, [q]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!form.name) return toast.error("El nombre es obligatorio");
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, form);
        toast.success("Producto actualizado");
      } else {
        await api.post("/products", form);
        toast.success("Producto creado");
      }
      setOpen(false); setForm(empty); setEditingId(null); load();
    } catch { toast.error("Error guardando"); }
  };

  const edit = (p) => { setForm(p); setEditingId(p.id); setOpen(true); };
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar producto?")) return;
    await api.delete(`/products/${id}`);
    toast.success("Eliminado"); load();
  };

  return (
    <div className="p-4 lg:p-6" data-testid="inventory-page">
      <div className="flex flex-col sm:flex-row justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inventario</h1>
          <p className="text-sm text-slate-500">Gestiona tus productos, precios y stock.</p>
        </div>
        <Button onClick={() => { setForm(empty); setEditingId(null); setOpen(true); }} className="bg-emerald-700 hover:bg-emerald-800" data-testid="new-product-btn">
          <Plus className="w-4 h-4 mr-1" /> Nuevo producto
        </Button>
        <Button variant="outline" onClick={() => setCatMgrOpen(true)} data-testid="open-cat-manager-btn">
          <Tags className="w-4 h-4 mr-1" /> Iconos y categorías
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Buscar por nombre, código, SKU..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="inv-search" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr className="text-left">
                <th className="p-3 font-semibold">Producto</th>
                <th className="p-3 font-semibold hidden md:table-cell">Código</th>
                <th className="p-3 font-semibold hidden lg:table-cell">Categoría</th>
                <th className="p-3 font-semibold text-right">Costo</th>
                <th className="p-3 font-semibold text-right">Precio</th>
                <th className="p-3 font-semibold text-right">Stock</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-500">
                  <Package className="w-8 h-8 mx-auto opacity-40" />
                  <p className="mt-2">Sin productos.</p>
                </td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className="border-b hover:bg-slate-50" data-testid={`row-${p.id}`}>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 font-mono text-xs hidden md:table-cell">{p.barcode || "-"}</td>
                  <td className="p-3 hidden lg:table-cell"><Badge variant="outline">{p.category}</Badge></td>
                  <td className="p-3 text-right font-mono">{formatCOP(p.cost)}</td>
                  <td className="p-3 text-right font-mono font-semibold">{formatCOP(p.price)}</td>
                  <td className="p-3 text-right font-mono">
                    <span className={p.stock <= 5 ? "text-orange-700 font-bold" : ""}>{p.stock} {p.unit}</span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => edit(p)} data-testid={`edit-${p.id}`}><Edit2 className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(p.id)} data-testid={`del-${p.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="product-form">
          <DialogHeader><DialogTitle>{editingId ? "Editar producto" : "Nuevo producto"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold">Nombre</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="f-name" />
            </div>
            <div>
              <label className="text-xs font-semibold">Código de barras</label>
              <Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="font-mono" data-testid="f-barcode" />
            </div>
            <div>
              <label className="text-xs font-semibold">Categoría</label>
              <Input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="f-category" />
            </div>
            <div>
              <label className="text-xs font-semibold">Costo</label>
              <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} data-testid="f-cost" />
            </div>
            <div>
              <label className="text-xs font-semibold">Precio venta</label>
              <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} data-testid="f-price" />
            </div>
            <div>
              <label className="text-xs font-semibold">Stock</label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} data-testid="f-stock" />
            </div>
            <div>
              <label className="text-xs font-semibold">Unidad</label>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} data-testid="f-unit" />
            </div>
            <div>
              <label className="text-xs font-semibold">IVA (%)</label>
              <Input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: Number(e.target.value) })} data-testid="f-tax" />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="is-service"
                checked={!!form.is_service}
                onChange={(e) => setForm({ ...form, is_service: e.target.checked })}
                className="w-4 h-4 accent-emerald-700"
                data-testid="f-service"
              />
              <label htmlFor="is-service" className="text-sm">Es un servicio (no descuenta stock: recargas, copias, giros)</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-emerald-700 hover:bg-emerald-800" data-testid="save-product-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CategoryManager open={catMgrOpen} onOpenChange={setCatMgrOpen} />
    </div>
  );
}
