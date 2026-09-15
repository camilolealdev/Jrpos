import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Tags, Package } from "lucide-react";

const empty = { name: "", active: true, start: "", end: "", items: [] };

// Editor de filas producto -> precio para una lista de precios: selector de
// producto (excluye los ya agregados para no duplicar overrides) + input de
// precio + botón agregar, igual patrón que ItemsEditor de SalesDocs.jsx pero
// con precio editable en vez de cantidad (aquí no hay cantidad, es un precio
// fijo por producto dentro de la lista).
function PriceListItemsEditor({ items, setItems, products }) {
  const [pid, setPid] = useState("");
  const [price, setPrice] = useState("");
  const safeItems = Array.isArray(items) ? items : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const usedIds = new Set(safeItems.map((it) => it.product_id));
  const available = safeProducts.filter((p) => !usedIds.has(p.id));

  const add = () => {
    const p = safeProducts.find((x) => x.id === pid);
    if (!p) return toast.error("Selecciona un producto");
    const numPrice = Number(price);
    if (!numPrice || numPrice <= 0) return toast.error("Ingresa un precio válido");
    setItems([...safeItems, { product_id: p.id, name: p.name, price: numPrice }]);
    setPid("");
    setPrice("");
  };

  const removeRow = (productId) => setItems(safeItems.filter((it) => it.product_id !== productId));
  const updatePrice = (productId, value) => {
    setItems(safeItems.map((it) => it.product_id === productId ? { ...it, price: Number(value) } : it));
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={pid} onValueChange={setPid}>
          <SelectTrigger className="flex-1" data-testid="pl-item-product"><SelectValue placeholder="Producto..." /></SelectTrigger>
          <SelectContent>
            {available.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name} · precio normal {formatCOP(p.price)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder="Precio"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-28 font-mono"
          data-testid="pl-item-price"
        />
        <Button variant="outline" onClick={add} data-testid="pl-add-item-btn"><Plus className="w-4 h-4" /></Button>
      </div>
      {safeItems.length === 0 && (
        <p className="text-xs text-slate-400 py-2">Sin productos aún. Agrega al menos uno para que la lista tenga efecto.</p>
      )}
      {safeItems.map((it) => (
        <div key={it.product_id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-md px-2 py-1.5">
          <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="flex-1 truncate">{it.name}</span>
          <Input
            type="number"
            value={it.price}
            onChange={(e) => updatePrice(it.product_id, e.target.value)}
            className="w-24 h-8 text-right font-mono"
          />
          <Button size="icon" variant="ghost" onClick={() => removeRow(it.product_id)}>
            <Trash2 className="w-3.5 h-3.5 text-red-600" />
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function PriceLists() {
  const [lists, setLists] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [pl, prods] = await Promise.all([api.get("/price-lists"), api.get("/products")]);
      setLists(Array.isArray(pl.data) ? pl.data : []);
      setProducts(Array.isArray(prods.data) ? prods.data : []);
    } catch {
      setLists([]);
      setProducts([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const safeLists = Array.isArray(lists) ? lists : [];

  const openCreate = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (pl) => {
    setForm({
      name: pl.name,
      active: pl.active,
      start: pl.start || "",
      end: pl.end || "",
      items: (pl.items || []).map((it) => ({ product_id: it.product_id, name: products.find((p) => p.id === it.product_id)?.name || it.product_id, price: it.price })),
    });
    setEditingId(pl.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name) return toast.error("El nombre es obligatorio");
    if (form.items.length === 0) return toast.error("Agrega al menos un producto con su precio");
    const payload = {
      name: form.name,
      active: form.active,
      start: form.start || null,
      end: form.end || null,
      items: form.items.map((it) => ({ product_id: it.product_id, price: Number(it.price) })),
    };
    try {
      if (editingId) await api.put(`/price-lists/${editingId}`, payload);
      else await api.post("/price-lists", payload);
      toast.success("Lista de precios guardada");
      setOpen(false); setForm(empty); setEditingId(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error guardando la lista"); }
  };

  const toggle = async (pl) => { await api.put(`/price-lists/${pl.id}`, { active: !pl.active }); load(); };
  const remove = async (id) => { if (window.confirm("¿Eliminar esta lista de precios?")) { await api.delete(`/price-lists/${id}`); load(); } };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="price-lists-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Tags className="w-6 h-6 text-emerald-700" /> Listas de Precios</h1>
          <p className="text-sm text-slate-500">
            Precio mayorista para clientes específicos, o ventana promocional tipo "happy hour" por rango de fechas.
          </p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={openCreate} data-testid="new-price-list-btn">
          <Plus className="w-4 h-4 mr-1" /> Nueva lista
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {safeLists.length === 0 && (
          <p className="text-slate-400 col-span-3 p-6 text-center">
            Sin listas de precios. Crea la primera (ej: "Mayorista" o "Happy Hour").
          </p>
        )}
        {safeLists.map((pl) => (
          <Card key={pl.id} data-testid={`price-list-${pl.id}`} className={!pl.active ? "opacity-60" : ""}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 grid place-items-center"><Tags className="w-4 h-4" /></div>
                  <div className="font-semibold text-sm">{pl.name}</div>
                </div>
                <Badge variant="outline" className={pl.active ? "bg-emerald-50 text-emerald-800 border-emerald-200" : ""}>
                  {pl.active ? "Activa" : "Inactiva"}
                </Badge>
              </div>
              <div className="text-sm text-slate-600">
                {(pl.items || []).length} producto(s) con precio especial
              </div>
              {(pl.start || pl.end) && <div className="text-xs text-slate-400 font-mono">{pl.start || "..."} → {pl.end || "..."}</div>}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => openEdit(pl)} data-testid={`edit-${pl.id}`}>Editar</Button>
                <Button size="sm" variant="outline" onClick={() => toggle(pl)} data-testid={`toggle-${pl.id}`}>{pl.active ? "Desactivar" : "Activar"}</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(pl.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="price-list-form">
          <DialogHeader><DialogTitle>{editingId ? "Editar" : "Nueva"} lista de precios</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold">Nombre</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ej: Mayorista, Happy Hour" data-testid="pl-name" />
            </div>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm font-medium">Activa</span>
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} data-testid="pl-active" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-xs font-semibold">Desde (opcional)</label>
                <Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
              <div><label className="text-xs font-semibold">Hasta (opcional)</label>
                <Input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            </div>
            <p className="text-xs text-slate-400">
              Deja las fechas vacías para una lista siempre vigente (mientras esté activa) — ideal para el precio mayorista
              por defecto de un cliente. Usa fechas para una ventana promocional (ej: happy hour de una tarde a otra).
            </p>
            <div>
              <label className="text-xs font-semibold">Precios por producto</label>
              <PriceListItemsEditor
                items={form.items}
                setItems={(items) => setForm({ ...form, items })}
                products={products}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-price-list-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
