import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Search, Package, Tags, Calculator, Camera, Barcode, Download, Upload, Sparkles, Loader2, FileSpreadsheet, AlertTriangle, CheckCircle2, History } from "lucide-react";
import CategoryManager from "@/components/CategoryManager";
import CameraScanner from "@/components/CameraScanner";
import BarcodeLabelModal from "@/components/BarcodeLabelModal";
import KardexModal from "@/components/KardexModal";

const empty = {
  name: "", barcode: "", category: "General", price: 0, cost: 0, stock: 0, unit: "und", tax_rate: 19,
  package_cost: "", units_per_package: 1, margin_percent: "", stock_packages: "", pack_only: false,
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
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false);
  const [labelProd, setLabelProd] = useState(null);
  const [kardexProd, setKardexProd] = useState(null);
  const [stockFilter, setStockFilter] = useState("all"); // "all", "low", "out", "ok"

  // Estado para importación masiva CSV
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importErrors, setImportErrors] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

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
    const result = {
      ...next,
      cost: Math.round(unitCost * 100) / 100,
      price: Math.round(unitPrice * 100) / 100,
    };
    // Si ya indicó cuántos paquetes recibió, recalcula el stock total en unidades
    // (stock siempre se guarda en unidades, nunca en paquetes).
    if (next.stock_packages !== "" && next.stock_packages != null) {
      const packages = Number(next.stock_packages) || 0;
      result.stock = Math.round(packages * upp * 1000) / 1000;
    }
    return result;
  };
  const setPackageField = (key, value) => setForm((f) => recomputeFromPackage({ ...f, [key]: value }));

  const save = async () => {
    if (!form.name) return toast.error("El nombre es obligatorio");
    // form.cost/form.price son siempre la fuente de verdad: se recalculan solos al tocar
    // costo por paquete/unidades/% utilidad, pero si el usuario los edita a mano después,
    // ese valor manda (el backend respeta el precio explícito sobre el % de utilidad).
    const payload = { ...form, cost: Number(form.cost) || 0, price: Number(form.price) || 0 };
    // El backend ya recorta espacios al crear/actualizar, pero lo hacemos
    // también aquí para que un barcode tipeado a mano con espacios de sobra
    // no vuelva a fallar el match exacto que hace el POS al escanear.
    if (typeof payload.barcode === "string") {
      payload.barcode = payload.barcode.trim() || null;
    }
    delete payload.stock_packages;
    // Unidades por paquete y "solo por paquete" son atributos del producto en sí
    // (los usa el POS para vender por unidad/paquete) y se guardan siempre, sin
    // importar si la calculadora de precio por % de utilidad está activada o no.
    payload.units_per_package = Number(form.units_per_package) || 1;
    payload.pack_only = Boolean(form.pack_only) && payload.units_per_package > 1;
    if (useMargin) {
      payload.package_cost = Number(form.package_cost) || 0;
      payload.margin_percent = Number(form.margin_percent) || 0;
    } else {
      delete payload.package_cost;
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

  const lookupBarcodeInfo = async (codeToLookup) => {
    const code = (codeToLookup || form.barcode || "").trim();
    if (!code) {
      return toast.info("Ingresa o escanea un código de barras primero");
    }
    // El código escaneado SIEMPRE se guarda en el formulario, sin importar si
    // el catálogo externo (Open Food/Beauty Facts) lo reconoce o si la
    // consulta falla por red. Antes solo se guardaba dentro del `if (found)`
    // de abajo: para un producto propio/local (el caso normal de un
    // minimarket) el catálogo externo nunca lo reconoce, así que el escaneo
    // se perdía en silencio y el producto quedaba sin barcode — el POS
    // después nunca podía encontrarlo por ese código.
    setForm((prev) => ({ ...prev, barcode: code }));
    setLookingUpBarcode(true);
    try {
      const { data } = await api.get(`/products/lookup-external/${encodeURIComponent(code)}`);
      if (data?.found) {
        setForm((prev) => ({
          ...prev,
          barcode: code,
          name: prev.name && prev.name.trim() ? prev.name : data.name || "",
          category: prev.category && prev.category !== "General" ? prev.category : data.category || "General",
        }));
        toast.success(`✨ Info encontrada: ${data.name}`);
      } else {
        toast.info("Código no encontrado en catálogo global — guardado igual, completa los datos manualmente.");
      }
    } catch {
      toast.error("No se pudo consultar el catálogo externo, pero el código quedó guardado.");
    } finally {
      setLookingUpBarcode(false);
    }
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
      const headers = ["Nombre", "Codigo_Barras", "Categoria", "Costo", "Precio", "Stock", "Unidad", "IVA"];
      const rows = items.map((p) => [
        `"${(p.name || "").replace(/"/g, '""')}"`,
        `"${p.barcode || ""}"`,
        `"${(p.category || "General").replace(/"/g, '""')}"`,
        Number(p.cost) || 0,
        Number(p.price) || 0,
        Number(p.stock) || 0,
        `"${p.unit || "und"}"`,
        Number(p.tax_rate) || 0,
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

  const downloadTemplateCSV = () => {
    const templateContent =
      "\uFEFFNombre,Codigo_Barras,Categoria,Costo,Precio,Stock,Unidad,IVA\n" +
      '"Arroz Diana 1kg","7701234567890","Abarrotes",3500,4500,25,"und",0\n' +
      '"Aceite Premier 1L","7701234567891","Abarrotes",8200,10500,12,"und",19\n' +
      '"Leche Entera Alquería 1.1L","7701234567892","Lácteos",3800,4900,18,"und",0\n' +
      '"Gaseosa Postobón Manzana 1.5L","7701234567893","Bebidas",3200,4500,30,"und",19\n';

    const blob = new Blob([templateContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_carga_masiva_jrpos.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Plantilla CSV descargada");
  };

  const parseCSVText = (text) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      toast.error("El archivo CSV no contiene filas de datos");
      return;
    }

    // Detect separator (comma or semicolon)
    const headerLine = lines[0];
    const separator = headerLine.includes(";") ? ";" : ",";

    const splitLine = (str) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === separator && !inQuotes) {
          result.push(current.trim().replace(/^["']|["']$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^["']|["']$/g, ""));
      return result;
    };

    const rawHeaders = splitLine(headerLine).map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "_"));

    // Find column index mappings
    const getIndex = (aliases) => rawHeaders.findIndex((h) => aliases.some((a) => h.includes(a)));

    const nameIdx = getIndex(["nombre", "name", "producto", "item", "descripcion"]);
    const barcodeIdx = getIndex(["codigo", "barcode", "barras", "ean", "upc"]);
    const catIdx = getIndex(["categoria", "category", "depto"]);
    const costIdx = getIndex(["costo", "cost", "compra"]);
    const priceIdx = getIndex(["precio", "price", "venta"]);
    const stockIdx = getIndex(["stock", "cantidad", "inventario", "qty"]);
    const unitIdx = getIndex(["unidad", "unit", "medida"]);
    const taxIdx = getIndex(["iva", "tax", "impuesto"]);

    if (nameIdx === -1) {
      toast.error("No se encontró la columna de Nombre de producto en el encabezado");
      return;
    }

    const parsed = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      if (cols.length === 0 || cols.every((c) => !c)) continue;

      const name = cols[nameIdx] || "";
      if (!name) {
        errors.push(`Fila ${i + 1}: Nombre de producto vacío`);
        continue;
      }

      const price = priceIdx !== -1 ? Number(String(cols[priceIdx]).replace(/[^\d.]/g, "")) : 0;
      const cost = costIdx !== -1 ? Number(String(cols[costIdx]).replace(/[^\d.]/g, "")) : 0;
      const stock = stockIdx !== -1 ? Number(String(cols[stockIdx]).replace(/[^\d.-]/g, "")) : 0;
      const barcode = barcodeIdx !== -1 ? String(cols[barcodeIdx] || "").trim() : "";
      const category = catIdx !== -1 ? String(cols[catIdx] || "General").trim() : "General";
      const unit = unitIdx !== -1 ? String(cols[unitIdx] || "und").trim() : "und";
      const tax_rate = taxIdx !== -1 ? Number(String(cols[taxIdx]).replace(/[^\d.]/g, "")) : 19;

      parsed.push({
        name,
        barcode: barcode || undefined,
        category: category || "General",
        price: isNaN(price) ? 0 : price,
        cost: isNaN(cost) ? 0 : cost,
        stock: isNaN(stock) ? 0 : stock,
        unit: unit || "und",
        tax_rate: isNaN(tax_rate) ? 19 : tax_rate,
      });
    }

    setImportPreview(parsed);
    setImportErrors(errors);
    setImportOpen(true);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") {
        parseCSVText(text);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const executeBulkImport = async () => {
    if (!importPreview || importPreview.length === 0) return toast.error("No hay productos válidos para importar");
    setIsImporting(true);
    try {
      const { data } = await api.post("/products/bulk", importPreview);
      toast.success(`✅ Importación completada: ${data?.created || importPreview.length} creados/actualizados`);
      setImportOpen(false);
      setImportPreview([]);
      setImportErrors([]);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error en la importación masiva");
    } finally {
      setIsImporting(false);
    }
  };

  // Conteo de filtros de stock
  const lowStockCount = items.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const outStockCount = items.filter((p) => p.stock <= 0).length;
  const okStockCount = items.filter((p) => p.stock > 5).length;

  const filteredItems = items.filter((p) => {
    if (stockFilter === "low") return p.stock > 0 && p.stock <= 5;
    if (stockFilter === "out") return p.stock <= 0;
    if (stockFilter === "ok") return p.stock > 5;
    return true;
  });

  return (
    <div className="p-4 lg:p-6" data-testid="inventory-page">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inventario</h1>
          <p className="text-sm text-slate-500">Gestiona tus productos, precios, stock e importación masiva.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="import-csv-file-input"
            />
            <Button variant="outline" asChild data-testid="import-inv-btn">
              <span><Upload className="w-4 h-4 mr-1 text-emerald-600" /> Importar CSV</span>
            </Button>
          </label>
          <Button onClick={exportCSV} variant="outline" data-testid="export-inv-btn">
            <Download className="w-4 h-4 mr-1" /> Exportar CSV
          </Button>
          <Button onClick={() => { setForm(empty); setEditingId(null); setUseMargin(false); setOpen(true); }} className="bg-emerald-700 hover:bg-emerald-800" data-testid="new-product-btn">
            <Plus className="w-4 h-4 mr-1" /> Nuevo producto
          </Button>
          <Button variant="outline" onClick={() => setCatMgrOpen(true)} data-testid="open-cat-manager-btn">
            <Tags className="w-4 h-4 mr-1" /> Categorías
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
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
          className="flex items-center gap-1.5 border-emerald-300 hover:bg-emerald-50 text-emerald-800 shrink-0"
          title="Escanear código de barras para buscar producto"
          data-testid="inv-barcode-search-btn"
        >
          <Barcode className="w-4 h-4 text-emerald-700" />
          <span className="hidden sm:inline text-xs font-semibold">Escanear</span>
        </Button>
      </div>

      {/* Filtros rápidos por estado de stock */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 items-center" data-testid="stock-filter-pills">
        <Button
          type="button"
          size="sm"
          variant={stockFilter === "all" ? "default" : "outline"}
          className={stockFilter === "all" ? "bg-emerald-700 hover:bg-emerald-800 text-xs h-8" : "text-xs h-8"}
          onClick={() => setStockFilter("all")}
          data-testid="filter-stock-all"
        >
          📦 Todos ({items.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={stockFilter === "low" ? "default" : "outline"}
          className={stockFilter === "low" ? "bg-amber-600 hover:bg-amber-700 text-white text-xs h-8" : "text-amber-700 border-amber-300 hover:bg-amber-50 text-xs h-8"}
          onClick={() => setStockFilter("low")}
          data-testid="filter-stock-low"
        >
          ⚠️ Stock Bajo ≤ 5 ({lowStockCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={stockFilter === "out" ? "default" : "outline"}
          className={stockFilter === "out" ? "bg-red-600 hover:bg-red-700 text-white text-xs h-8" : "text-red-700 border-red-300 hover:bg-red-50 text-xs h-8"}
          onClick={() => setStockFilter("out")}
          data-testid="filter-stock-out"
        >
          🚫 Agotados ({outStockCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={stockFilter === "ok" ? "default" : "outline"}
          className={stockFilter === "ok" ? "bg-emerald-700 hover:bg-emerald-800 text-xs h-8" : "text-slate-600 text-xs h-8"}
          onClick={() => setStockFilter("ok")}
          data-testid="filter-stock-ok"
        >
          ✅ En Stock ({okStockCount})
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
              {(!Array.isArray(filteredItems) || filteredItems.length === 0) ? (
                <tr><td colSpan={8} className="p-8 text-center text-slate-500">
                  <Package className="w-8 h-8 mx-auto opacity-40" />
                  <p className="mt-2">Sin productos para el filtro seleccionado.</p>
                </td></tr>
              ) : filteredItems.map((p) => (
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
                    <span className={p.stock <= 0 ? "text-red-700 font-bold" : p.stock <= 5 ? "text-amber-700 font-bold" : ""}>
                      {p.stock} {p.unit}
                    </span>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" onClick={() => setLabelProd(p)} title="Imprimir etiquetas con código de barras" data-testid={`label-${p.id}`}><Barcode className="w-4 h-4 text-emerald-700" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setKardexProd(p)} title="Ver Kardex (historial de movimientos)" data-testid={`kardex-${p.id}`}><History className="w-4 h-4 text-slate-600" /></Button>
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
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold">Código de barras</label>
                {form.barcode && (
                  <button
                    type="button"
                    onClick={() => lookupBarcodeInfo(form.barcode)}
                    disabled={lookingUpBarcode}
                    className="text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium disabled:opacity-50"
                  >
                    {lookingUpBarcode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-500" />}
                    Autocompletar
                  </button>
                )}
              </div>
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

            <div>
              <label className="text-xs font-semibold">Unidades por paquete/caja</label>
              <Input
                type="number"
                value={form.units_per_package}
                onChange={(e) => setPackageField("units_per_package", e.target.value)}
                data-testid="f-units-per-package"
                placeholder="Ej: 6 (sixpack) o 24 (caja)"
              />
            </div>
            {Number(form.units_per_package) > 1 ? (
              <div className="col-span-2 flex items-start gap-2 rounded-lg bg-indigo-50 border border-indigo-200 p-2.5">
                <input
                  type="checkbox"
                  id="f-pack-only"
                  checked={!!form.pack_only}
                  onChange={(e) => setForm((f) => ({ ...f, pack_only: e.target.checked }))}
                  data-testid="f-pack-only"
                  className="w-4 h-4 mt-0.5"
                />
                <label htmlFor="f-pack-only" className="text-xs cursor-pointer">
                  <span className="font-semibold text-indigo-900">Este producto SOLO se vende por paquete/caja completo</span>
                  <br />
                  <span className="text-slate-500">
                    Actívalo si nunca se abre el paquete para vender suelto (ej: pack cerrado). Déjalo
                    desactivado si también se vende por unidad — así el POS ofrece ambas opciones
                    (ej: cerveza por unidad o en six).
                  </span>
                </label>
              </div>
            ) : null}

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
                <div className="col-span-2">
                  <label className="text-xs font-semibold">Costo por paquete/caja</label>
                  <Input type="number" value={form.package_cost} onChange={(e) => setPackageField("package_cost", e.target.value)} data-testid="f-package-cost" placeholder="Ej: 48000" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold">% de utilidad</label>
                  <Input type="number" value={form.margin_percent} onChange={(e) => setPackageField("margin_percent", e.target.value)} data-testid="f-margin-percent" placeholder="Ej: 30" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-semibold">Stock recibido (en paquetes/cajas)</label>
                  <Input
                    type="number"
                    value={form.stock_packages}
                    onChange={(e) => setPackageField("stock_packages", e.target.value)}
                    data-testid="f-stock-packages"
                    placeholder="Ej: 5 cajas"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Cuántos paquetes/cajas tienes físicamente — se convierte solo a unidades abajo en "Stock".
                  </p>
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
              <label className="text-xs font-semibold">Stock {useMargin ? "(unidades, calculado)" : "(unidades)"}</label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value), stock_packages: "" })} data-testid="f-stock" />
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

      {/* Modal de Importación Masiva CSV */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl" data-testid="import-csv-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
              <span>Importación Masiva de Productos (CSV)</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-3 bg-slate-50 border rounded-lg">
              <div>
                <p className="text-xs text-slate-600 font-medium">¿No tienes el formato adecuado? Descarga nuestra plantilla lista para Excel.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={downloadTemplateCSV} className="shrink-0 text-xs">
                <Download className="w-3.5 h-3.5 mr-1" /> Descargar Plantilla
              </Button>
            </div>

            {importErrors.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1 text-amber-800">
                <div className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Advertencias en {importErrors.length} filas (se omitirán):</span>
                </div>
                <div className="max-h-20 overflow-y-auto pl-5 list-disc space-y-0.5 font-mono text-[11px]">
                  {importErrors.slice(0, 5).map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                  {importErrors.length > 5 && <div>...y {importErrors.length - 5} filas más</div>}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">
                  Vista Previa ({importPreview.length} productos válidos detectados)
                </span>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> Listo para procesar
                </Badge>
              </div>

              <div className="max-h-56 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 border-b sticky top-0">
                    <tr className="text-left font-semibold text-slate-700">
                      <th className="p-2">Producto</th>
                      <th className="p-2">Código</th>
                      <th className="p-2">Categoría</th>
                      <th className="p-2 text-right">Costo</th>
                      <th className="p-2 text-right">Precio</th>
                      <th className="p-2 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 15).map((p, idx) => (
                      <tr key={idx} className="border-b hover:bg-slate-50">
                        <td className="p-2 font-medium truncate max-w-[150px]">{p.name}</td>
                        <td className="p-2 font-mono text-slate-500">{p.barcode || "-"}</td>
                        <td className="p-2">{p.category}</td>
                        <td className="p-2 text-right font-mono">{formatCOP(p.cost)}</td>
                        <td className="p-2 text-right font-mono font-semibold">{formatCOP(p.price)}</td>
                        <td className="p-2 text-right font-mono">{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importPreview.length > 15 && (
                <p className="text-[11px] text-slate-400 text-center">
                  Mostrando primeros 15 de {importPreview.length} productos
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={isImporting}>
              Cancelar
            </Button>
            <Button
              onClick={executeBulkImport}
              className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
              disabled={isImporting || importPreview.length === 0}
              data-testid="confirm-bulk-import-btn"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Importando...
                </>
              ) : (
                `Importar ${importPreview.length} Productos`
              )}
            </Button>
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
          lookupBarcodeInfo(code);
        }}
      />

      {/* Modal para impresión de etiquetas de código de barras */}
      <BarcodeLabelModal
        open={!!labelProd}
        onOpenChange={(v) => !v && setLabelProd(null)}
        product={labelProd}
      />

      {/* Modal de Kardex: historial de movimientos de stock */}
      <KardexModal
        open={!!kardexProd}
        onOpenChange={(v) => !v && setKardexProd(null)}
        product={kardexProd}
      />
    </div>
  );
}
