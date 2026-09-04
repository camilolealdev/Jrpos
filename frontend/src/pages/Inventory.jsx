import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Search, Package, Tags, Calculator, Camera, Barcode, Download } from "lucide-react";
import CategoryManager from "@/components/CategoryManager";
import CameraScanner from "@/components/CameraScanner";
import BarcodeLabelModal from "@/components/BarcodeLabelModal";

const empty = {
  name: "", barcode: "", category: "General", price: 0, cost: 0, stock: 0, unit: "und", tax_rate: 19,
  package_cost: "", units_per_package: 1, margin_percent: "",
};

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [catMgrOpen, setCatMgrOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [useMargin, setUseMargin] = useState(false);
  const [searchCamOpen, setSearchCamOpen] = useState(false);
  const [formCamOpen, setFormCamOpen] = useState(false);
  const [labelProd, setLabelProd] = useState(null);

  // Debounce de búsqueda para evitar spam de peticiones
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/products", { params: { q: debouncedQ || undefined } });
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  }, [debouncedQ]);

  useEffect(() => {
    load();
  }, [load]);

  // Recalcula costo/precio unitario cuando cambia costo por paquete, unidades por paquete o % de
  // utilidad — pero quedan en inputs normales así que después se pueden digitar/ajustar a mano
  // sin que se vuelvan a pisar (solo se recalculan si tocas de nuevo alguno de esos 3 campos).
  const recomputeFromPackage = (next) => {
    const upp = Number(next.units_per_package) > 0 ? Number(next.units_per_package) : 1;
    const pkgCost = Number(next.package_cost) || 0;
    const margin = Number(next.margin_percent) || 0;
    const unitCost = upp ? pkgCost / upp : pkgCost;
    const unitPrice = unitCost * (1 + margin / 100);
    return {
      ...next,
      cost: Math.round(unitCost * 100) / 100,
      price: Math.round(unitPrice * 100) / 100,
    };
  };
  const setPackageField = (key, value) => setForm((f) => recomputeFromPackage({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name) return toast.error("El nombre es obligatorio");
    // form.cost/form.price son siempre la fuente de verdad: se recalculan solos al tocar
    // costo por paquete/unidades/% utilidad, pero si el usuario los edita a mano después,
    // ese valor manda (el backend respeta el precio explícito sobre el % de utilidad).
    const payload = { ...form, cost: Number(form.cost) || 0, price: Number(form.price) || 0 };
    if (useMargin) {
      payload.package_cost = Number(form.package_cost) || 0;
      payload.units_per_package = Number(form.units_per_package) || 1;
      payload.margin_percent = Number(form.margin_percent) || 0;
    } else {
      delete payload.package_cost;
      delete payload.units_per_package;
      delete payload.margin_percent;
    }
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        toast.success("Producto actualizado");
      } else {
        await api.post("/products", payload);
        toast.success("Producto creado");
      }
      setOpen(false); setForm(empty); setEditingId(null); setUseMargin(false); load();
    } catch { toast.error("Error guardando"); }
  };

  const edit = (p) => {
    setForm({
      ...empty, ...p,
      package_cost: "", units_per_package: p.units_per_package || 1, margin_percent: p.margin_percent ?? "",
    });
    setUseMargin(false);
    setEditingId(p.id);
    setOpen(true);
  };
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar producto?")) return;
    await api.delete(`/products/${id}`);
    toast.success("Eliminado"); load();
  };

  const exportCSV = () => {
    if (!Array.isArray(items) || items.length === 0) return toast.error("No hay productos para exportar");
    try {
      const headers = ["ID", "Nombre", "Codigo_Barras", "Categoria", "Costo", "Precio", "Utilidad_Porcentaje", "Stock", "Unidad", "IVA"];
      const rows = items.map((p) => [
        `"${p.id || ""}"`,
        `"${(p.name || "").replace(/"/g, '""')}"`,
        `"${p.barcode || ""}"`,
        `"${(p.category || "General").replace(/"/g, '""')}"`,
        Number(p.cost) || 0,
        Number(p.price) || 0,
        p.margin_percent != null ? Number(p.margin_percent) : "",
        Number(p.stock) || 0,
        `"${p.unit || "und"}"`,
        Number(p.tax_rate) || 19,
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `inventario_jrpos_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Catálogo de inventario exportado con éxito");
    } catch {
      toast.error("Error exportando inventario");
    }
  };

  return (
    <div className="p-4 lg:p-6" data-testid="inventory-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inventario</h1>
          <p className="text-sm text-slate-500">Gestiona tus productos, precios y stock.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={exportCSV} variant="outline" data-testid="export-inv-btn">
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
          <Button onClick={() => { setForm(empty); setEditingId(null); setUseMargin(false); setOpen(true); }} className="bg-emerald-700 hover:bg-emerald-800" data-testid="new-product-btn">
            <Plus className="w-4 h-4 mr-1" /> Nuevo producto
          </Button>
          <Button variant="outline" onClick={() => setCatMgrOpen(true)} data-testid="open-cat-manager-btn">
            <Tags className="w-4 h-4 mr-1" /> Iconos y categorías
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, código de barras, SKU..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            data-testid="inv-search"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setSearchCamOpen(true)}
          className="flex items-center gap-1.5 border-emerald-300 hover:bg-emerald-50 text-emerald-800"
          title="Escanear código de barras para buscar producto"
          data-testid="inv-barcode-search-btn"
        >
          <Barcode className="w-4 h-4 text-emerald-700" />
          <span className="hidden sm:inline text-xs font-semibold">Escanear</span>
        </Button>
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
                <th className="p-3 font-semibold hidden lg:table-cell text-right">Utilidad</th>
                <th className="p-3 font-semibold text-right">Stock</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {(!Array.isArray(items) || items.length === 0) ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">
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
                  <td className="p-3 text-right font-mono hidden lg:table-cell text-emerald-700">
                    {p.margin_percent != null ? `${p.margin_percent}%` : "-"}
                  </td>
                  <td className="p-3 text-right font-mono">
                    <span className={p.stock <= 5 ? "text-orange-700 font-bold" : ""}>{p.stock} {p.unit}</span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setLabelProd(p)} title="Imprimir etiquetas con código de barras" data-testid={`label-${p.id}`}><Barcode className="w-4 h-4 text-emerald-700" /></Button>
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
              <div className="flex gap-1.5 mt-1">
                <Input
                  value={form.barcode || ""}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  className="font-mono flex-1"
                  placeholder="Ej: 7702001..."
                  data-testid="f-barcode"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="border-emerald-300 hover:bg-emerald-50 text-emerald-700"
                  onClick={() => setFormCamOpen(true)}
                  title="Escanear código con la cámara"
                  data-testid="f-barcode-scan-btn"
                >
                  <Camera className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold">Categoría</label>
              <Input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1" data-testid="f-category" />
            </div>

            <div className="col-span-2 flex items-center justify-between border-t pt-3 mt-1">
              <span className="text-xs font-semibold flex items-center gap-1"><Calculator className="w-3.5 h-3.5" /> Calcular precio con % de utilidad</span>
              <Button
                type="button" size="sm" variant={useMargin ? "default" : "outline"}
                className={useMargin ? "bg-emerald-700 hover:bg-emerald-800 h-7" : "h-7"}
                onClick={() => setUseMargin((v) => !v)}
                data-testid="toggle-margin-calc"
              >
                {useMargin ? "Activado" : "Desactivado"}
              </Button>
            </div>

            {useMargin ? (
              <>
                <div>
                  <label className="text-xs font-semibold">Costo por paquete/caja</label>
                  <Input type="number" value={form.package_cost} onChange={(e) => setPackageField("package_cost", e.target.value)} data-testid="f-package-cost" placeholder="Ej: 48000" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Unidades por paquete</label>
                  <Input type="number" value={form.units_per_package} onChange={(e) => setPackageField("units_per_package", e.target.value)} data-testid="f-units-per-package" placeholder="Ej: 24" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold">% de utilidad</label>
                  <Input type="number" value={form.margin_percent} onChange={(e) => setPackageField("margin_percent", e.target.value)} data-testid="f-margin-percent" placeholder="Ej: 30" />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg bg-emerald-50 border border-emerald-200 p-2.5" data-testid="margin-preview">
                  <div>
                    <label className="text-xs font-semibold">Costo unitario (calculado, editable)</label>
                    <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} data-testid="f-cost-margin" className="font-mono bg-white" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-emerald-700">Precio de venta (calculado, editable)</label>
                    <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} data-testid="f-price-margin" className="font-mono bg-white" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold">Costo</label>
                  <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} data-testid="f-cost" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Precio venta</label>
                  <Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} data-testid="f-price" />
                </div>
              </>
            )}

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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="bg-emerald-700 hover:bg-emerald-800" data-testid="save-product-btn">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CategoryManager open={catMgrOpen} onOpenChange={setCatMgrOpen} onSaved={load} />

      {/* Escáner para búsqueda rápida en el inventario */}
      <CameraScanner
        open={searchCamOpen}
        onOpenChange={setSearchCamOpen}
        onScan={(code) => {
          setQ(code);
          toast.success(`Código escaneado: ${code}`);
        }}
      />

      {/* Escáner para asignar código de barras en el formulario de producto */}
      <CameraScanner
        open={formCamOpen}
        onOpenChange={setFormCamOpen}
        onScan={(code) => {
          setForm((prev) => ({ ...prev, barcode: code }));
          toast.success(`Código asignado: ${code}`);
        }}
      />

      {/* Modal para impresión de etiquetas de código de barras */}
      <BarcodeLabelModal
        open={!!labelProd}
        onOpenChange={(v) => !v && setLabelProd(null)}
        product={labelProd}
      />
    </div>
  );
}
