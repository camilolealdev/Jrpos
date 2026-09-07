import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { categoryIcon } from "@/lib/categoryIcons";
import { printThermal } from "@/lib/thermalPrint";
import { cacheProductsOffline, getCachedProductsOffline, queueOfflineSale } from "@/lib/offlineSync";
import CameraScanner from "@/components/CameraScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Trash2, Plus, Minus, ScanLine, ShoppingCart, CircleDollarSign, X, Package as PackageIcon, Pause, Play, Users } from "lucide-react";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem("jrpos_pos_cart");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedCats, setSelectedCats] = useState([]); // multi-select; [] = todas
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payment, setPayment] = useState("efectivo");
  const [received, setReceived] = useState("");
  const [receiptSale, setReceiptSale] = useState(null);
  const [held, setHeld] = useState([]);
  const [promos, setPromos] = useState([]);
  const [camOpen, setCamOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newProd, setNewProd] = useState({ barcode: "", name: "", price: 0, cost: 0, stock: 1, category: "General" });
  const [searchResults, setSearchResults] = useState(null); // null=cerrado; [] o [items] = abierto con resultados de búsqueda por nombre
  const barcodeRef = useRef(null);

  useEffect(() => {
    try {
      if (cart.length > 0) {
        sessionStorage.setItem("jrpos_pos_cart", JSON.stringify(cart));
      } else {
        sessionStorage.removeItem("jrpos_pos_cart");
      }
    } catch {}
  }, [cart]);

  const loadHeld = async () => {
    try {
      const { data } = await api.get("/held");
      setHeld(Array.isArray(data) ? data : []);
    } catch { setHeld([]); }
  };

  const load = useCallback(async () => {
    const params = { q: q || undefined };
    if (selectedCats.length > 0) params.categories = selectedCats.join(",");
    try {
      const { data } = await api.get("/products", { params });
      const items = Array.isArray(data) ? data : [];
      setProducts(items);
      if (items.length > 0 && !q && selectedCats.length === 0) {
        cacheProductsOffline(items);
      }
    } catch {
      try {
        const cached = await getCachedProductsOffline();
        if (cached && cached.length > 0) {
          let filtered = cached;
          if (q) {
            const lower = q.toLowerCase();
            filtered = filtered.filter((p) => (p.name && p.name.toLowerCase().includes(lower)) || (p.barcode && p.barcode.includes(q)));
          }
          if (selectedCats.length > 0) {
            filtered = filtered.filter((p) => selectedCats.includes(p.category));
          }
          setProducts(filtered);
        } else {
          setProducts([]);
        }
      } catch {
        setProducts([]);
      }
    }
  }, [q, selectedCats]);

  const loadCats = async () => {
    try {
      const { data } = await api.get("/categories");
      setCategories(Array.isArray(data) ? data : []);
    } catch { setCategories([]); }
  };

  const loadCustomers = async () => {
    try {
      const { data } = await api.get("/contacts", { params: { kind: "customer" } });
      setCustomers(Array.isArray(data) ? data : []);
    } catch { setCustomers([]); }
  };

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    loadCats(); loadCustomers(); loadHeld();
    api.get("/promotions/active")
      .then((r) => setPromos(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPromos([]));
  }, []);

  const holdCurrent = async () => {
    if (cart.length === 0) return toast.error("El carrito está vacío");
    const label = window.prompt("Nombre de la cuenta (ej: Mesa 1, Juan):", `Cuenta ${held.length + 1}`);
    if (label === null) return;
    try {
      await api.post("/held", {
        label: label || `Cuenta ${held.length + 1}`,
        items: cart,
        customer_id: customerId || undefined,
        customer_name: customers.find((x) => x.id === customerId)?.name,
      });
      setCart([]); setCustomerId("");
      loadHeld();
      toast.success("Cuenta retenida. Puedes atender a otro cliente.");
    } catch { toast.error("Error reteniendo cuenta"); }
  };

  const resumeHeld = async (h) => {
    // Si hay carrito actual, retenerlo primero para no mezclar cuentas
    if (cart.length > 0) {
      const label = window.prompt("La cuenta actual se retendrá. Nombre:", `Cuenta ${held.length + 1}`);
      if (label === null) return;
      try {
        await api.post("/held", { label: label || `Cuenta ${held.length + 1}`, items: cart, customer_id: customerId || undefined });
      } catch {
        return toast.error("No se pudo retener la cuenta actual. No se recuperó la otra para evitar mezclas.");
      }
    }
    try {
      await api.delete(`/held/${h.id}`);
      setCart(h.items);
      setCustomerId(h.customer_id || "");
      loadHeld();
      toast.success(`Cuenta "${h.label}" recuperada`);
    } catch { toast.error("Error recuperando la cuenta"); }
  };

  const toggleCat = (name) => {
    setSelectedCats((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  };

  const playScannerBeep = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch { /* Audio not allowed before user interaction */ }
  };

  const addToCart = (p) => {
    playScannerBeep();
    setCart((prev) => {
      const found = prev.find((x) => x.product_id === p.id);
      if (found) return prev.map((x) => x.product_id === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...prev, { product_id: p.id, name: p.name, barcode: p.barcode, qty: 1, price: p.price, tax_rate: p.tax_rate }];
    });
  };
  const changeQty = (id, d) => {
    setCart((prev) => prev.map((x) => x.product_id === id ? { ...x, qty: Math.max(0, x.qty + d) } : x).filter(x => x.qty > 0));
  };
  const removeItem = (id) => setCart((prev) => prev.filter(x => x.product_id !== id));
  const clearCart = () => setCart([]);

  const normCategories = useMemo(() => {
    if (!Array.isArray(categories)) return [];
    return categories.map((c) => {
      if (typeof c === "string") return { name: c, count: 0, emoji: "" };
      return { name: c?.name || "", count: Number(c?.count) || 0, emoji: c?.emoji || "" };
    }).filter(c => c.name);
  }, [categories]);

  const totals = useMemo(() => {
    const safeCart = Array.isArray(cart) ? cart : [];
    const safePromos = Array.isArray(promos) ? promos : [];
    const safeProducts = Array.isArray(products) ? products : [];
    const subtotal = safeCart.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.price) || 0), 0);
    const tax = safeCart.reduce((s, x) => {
      const q = Number(x.qty) || 0;
      const p = Number(x.price) || 0;
      const tr = Number(x.tax_rate) || 0;
      return s + (q * p) * (tr / 100) / (1 + tr / 100);
    }, 0);
    // Descuento por promociones activas
    const catOf = (pid) => safeProducts.find((p) => p.id === pid)?.category;
    let promo = 0;
    for (const pr of safePromos) {
      if (pr.type === "percent_all") promo += subtotal * ((Number(pr.value) || 0) / 100);
      else if (pr.type === "percent_category" && pr.category)
        promo += safeCart.filter((x) => catOf(x.product_id) === pr.category).reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.price) || 0), 0) * ((Number(pr.value) || 0) / 100);
    }
    promo = Math.min(promo, subtotal);
    return { subtotal, tax, promo: Math.round(promo), total: subtotal - Math.round(promo) };
  }, [cart, promos, products]);

  const lookupBarcode = async (code) => {
    if (!code) return;
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      addToCart(data);
      toast.success(`+ ${data.name}`);
    } catch {
      // No es un código de barras registrado: puede que el usuario haya escrito un nombre
      // (ej. "aceite" en vez de escanear) — buscar coincidencias por nombre antes de asumir
      // que hay que crear un producto nuevo, para no duplicar productos ya existentes.
      try {
        const { data: matches } = await api.get("/products", { params: { q: code, limit: 8 } });
        if (Array.isArray(matches) && matches.length > 0) {
          setSearchResults({ query: code, items: matches });
          return;
        }
      } catch { /* si la búsqueda falla, cae a crear producto igual */ }
      const looksLikeBarcode = /^\d+$/.test(code);
      let autoName = looksLikeBarcode ? "" : code;
      let autoCategory = "General";
      if (looksLikeBarcode) {
        try {
          const { data: ext } = await api.get(`/products/lookup-external/${encodeURIComponent(code)}`);
          if (ext?.found) {
            autoName = ext.name || "";
            autoCategory = ext.category || "General";
            toast.info(`✨ Producto identificado: ${ext.name}`);
          }
        } catch { /* si falla, continúa con campos en blanco */ }
      }
      setNewProd({ barcode: looksLikeBarcode ? code : "", name: autoName, price: 0, cost: 0, stock: 1, category: autoCategory });
      setCreateOpen(true);
    }
  };

  const pickSearchResult = (p) => {
    addToCart(p);
    toast.success(`+ ${p.name}`);
    setSearchResults(null);
  };

  const createFromSearch = async () => {
    const code = searchResults?.query || "";
    const looksLikeBarcode = /^\d+$/.test(code);
    let autoName = looksLikeBarcode ? "" : code;
    let autoCategory = "General";
    if (looksLikeBarcode) {
      try {
        const { data: ext } = await api.get(`/products/lookup-external/${encodeURIComponent(code)}`);
        if (ext?.found) {
          autoName = ext.name || "";
          autoCategory = ext.category || "General";
        }
      } catch { /* ignore */ }
    }
    setNewProd({ barcode: looksLikeBarcode ? code : "", name: autoName, price: 0, cost: 0, stock: 1, category: autoCategory });
    setSearchResults(null);
    setCreateOpen(true);
  };

  const createScannedProduct = async () => {
    if (!newProd.name) return toast.error("Ingresa el nombre del producto");
    try {
      const { data } = await api.post("/products", {
        name: newProd.name,
        barcode: newProd.barcode,
        category: newProd.category || "General",
        price: Number(newProd.price) || 0,
        cost: Number(newProd.cost) || 0,
        stock: Number(newProd.stock) || 0,
        tax_rate: 19,
      });
      addToCart(data);
      setCreateOpen(false);
      toast.success(`Producto "${data.name}" creado y agregado`);
      load();
      loadCats();
    } catch { toast.error("Error creando producto"); }
  };

  const onBarcodeSubmit = async (e) => {
    e.preventDefault();
    const code = barcodeRef.current?.value?.trim();
    if (!code) return;
    await lookupBarcode(code);
    barcodeRef.current.value = "";
  };

  const checkout = async () => {
    if (cart.length === 0) return;
    if (payment === "credito" && !customerId) return toast.error("Selecciona un cliente para venta a crédito");
    const items = cart.map((c) => ({ ...c, subtotal: c.qty * c.price }));
    const customer = customers.find((x) => x.id === customerId);
    const salePayload = {
      items,
      discount: totals.promo,
      payment_method: payment,
      customer_id: customerId || undefined,
      customer_name: customer?.name || undefined,
    };

    try {
      const { data } = await api.post("/sales", salePayload);
      setReceiptSale(data);
      setPayOpen(false);
      setCart([]);
      setReceived("");
      setCustomerId("");
      toast.success(`Venta ${data.number} registrada${data.is_credit ? " a crédito" : ""}`);
      load();
    } catch (e) {
      if (!navigator.onLine || !e.response || e.code === "ERR_NETWORK" || e.message === "Network Error") {
        try {
          const offlineNumber = `OFF-${Date.now().toString().slice(-6)}`;
          const fallbackSale = {
            ...salePayload,
            number: offlineNumber,
            total: totals.total,
            subtotal: totals.subtotal,
            tax: totals.tax,
            created_at: new Date().toISOString(),
            is_offline: true,
          };
          await queueOfflineSale(fallbackSale);
          setReceiptSale(fallbackSale);
          setPayOpen(false);
          setCart([]);
          setReceived("");
          setCustomerId("");
          toast.success(`Venta ${offlineNumber} guardada localmente (Modo Offline). Se sincronizará automáticamente al volver internet.`);
          return;
        } catch {
          toast.error("Error guardando venta offline");
          return;
        }
      }
      toast.error(e?.response?.data?.detail || "Error registrando venta");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // F2: Enfoque al lector de código de barras
      if (e.key === "F2") {
        e.preventDefault();
        barcodeRef.current?.focus();
        barcodeRef.current?.select();
      }
      // F4: Vaciar carrito
      if (e.key === "F4" && cart.length > 0) {
        e.preventDefault();
        if (window.confirm("¿Vaciar carrito de compras?")) clearCart();
      }
      // F9: Abrir cobro
      if (e.key === "F9" && cart.length > 0 && !payOpen) {
        e.preventDefault();
        setPayOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, payOpen]);

  const change = Number(received || 0) - totals.total;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)] grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-0 lg:overflow-hidden" data-testid="pos-page">
      {/* Left: product grid */}
      <div className="p-3 lg:p-5 flex flex-col min-h-0 lg:overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-2 mb-1.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Buscar producto por nombre..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-11"
              data-testid="pos-search-input"
            />
          </div>
          <form onSubmit={onBarcodeSubmit} className="relative flex-1 sm:flex-initial sm:w-64">
            <ScanLine className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" />
            <Input
              ref={barcodeRef}
              placeholder="Escanea código (F2)..."
              className="pl-9 h-11 font-mono"
              data-testid="pos-barcode-input"
              autoFocus
            />
          </form>
          <Button
            type="button"
            variant="outline"
            className="h-11 shrink-0"
            onClick={() => setCamOpen(true)}
            data-testid="open-camera-scan-btn"
            title="Escanear con cámara"
          >
            📷 <span className="hidden sm:inline ml-1">Cámara</span>
          </Button>
        </div>
        <CameraScanner open={camOpen} onOpenChange={setCamOpen} onScan={(code) => lookupBarcode(code)} />

        {/* Código no coincide, pero hay productos con nombre/código parecido: elegir en vez de duplicar */}
        <Dialog open={!!searchResults} onOpenChange={(v) => !v && setSearchResults(null)}>
          <DialogContent data-testid="barcode-search-results-dialog">
            <DialogHeader>
              <DialogTitle>¿Buscabas alguno de estos?</DialogTitle>
              <DialogDescription>
                "{searchResults?.query}" no es un código de barras registrado, pero encontramos productos parecidos.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {(searchResults?.items || []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickSearchResult(p)}
                  className="w-full text-left flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50 transition"
                  data-testid={`barcode-search-result-${p.id}`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.barcode || "sin código"} · {p.category}</div>
                  </div>
                  <div className="font-mono font-bold text-sm shrink-0">{formatCOP(p.price)}</div>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={createFromSearch} data-testid="none-of-these-create-btn">
                Ninguno, crear producto nuevo
              </Button>
              <Button variant="ghost" onClick={() => setSearchResults(null)}>Cancelar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Crear producto al escanear código desconocido */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent data-testid="create-scanned-dialog">
            <DialogHeader>
              <DialogTitle>Código no registrado</DialogTitle>
              <DialogDescription>Crea el producto y se agregará al carrito de una vez.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Código de barras</label>
                <Input value={newProd.barcode} readOnly className="font-mono bg-slate-50" data-testid="np-barcode" />
              </div>
              <div>
                <label className="text-xs font-semibold">Nombre del producto</label>
                <Input value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} autoFocus data-testid="np-name" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold">Precio venta</label>
                  <Input type="number" value={newProd.price} onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} className="font-mono" data-testid="np-price" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Costo</label>
                  <Input type="number" value={newProd.cost} onChange={(e) => setNewProd({ ...newProd, cost: e.target.value })} className="font-mono" data-testid="np-cost" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Stock inicial</label>
                  <Input type="number" value={newProd.stock} onChange={(e) => setNewProd({ ...newProd, stock: e.target.value })} className="font-mono" data-testid="np-stock" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Categoría</label>
                  <Input value={newProd.category} onChange={(e) => setNewProd({ ...newProd, category: e.target.value })} data-testid="np-category" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={createScannedProduct} data-testid="create-scanned-btn">Crear y agregar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Category chips - dinámicas desde inventario con multi-select e iconos */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1 items-center" data-testid="pos-category-chips">
          <button
            onClick={() => setSelectedCats([])}
            className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border transition ${selectedCats.length === 0 ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"}`}
            data-testid="pos-cat-all"
          >
            🛍️ Todas · {normCategories.reduce((s, c) => s + (c.count || 0), 0)}
          </button>
          {normCategories.map((c) => {
            const on = selectedCats.includes(c.name);
            return (
              <button
                key={c.name}
                onClick={() => toggleCat(c.name)}
                className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border transition inline-flex items-center gap-1.5 ${on ? "bg-emerald-700 text-white border-emerald-700 ring-2 ring-emerald-300" : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"}`}
                data-testid={`pos-cat-${c.name}`}
                aria-pressed={on}
              >
                <span className="text-base leading-none">{c.emoji || categoryIcon(c.name)}</span>
                <span>{c.name}</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{c.count}</span>
              </button>
            );
          })}
          {selectedCats.length > 0 && (
            <button
              onClick={() => setSelectedCats([])}
              className="shrink-0 h-9 px-3 rounded-full text-xs font-semibold border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition"
              data-testid="pos-cat-clear"
            >
              ✕ Limpiar ({selectedCats.length})
            </button>
          )}
        </div>

        <ScrollArea className="flex-1">
          {(!Array.isArray(products) || products.length === 0) ? (
            <div className="text-center py-12 text-slate-500">
              <PackageIcon className="w-10 h-10 mx-auto opacity-40" />
              <p className="mt-2">Sin productos. Carga demo desde el panel o crea en Inventario.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pr-2">
              {products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  className="text-left group border border-slate-200 rounded-lg bg-white hover:border-emerald-500 hover:shadow-md transition-all p-3 touch-btn"
                  data-testid={`pos-product-${p.id}`}
                >
                  <div className="text-[11px] uppercase font-semibold tracking-wider text-emerald-700 flex items-center gap-1">
                    <span>{(normCategories.find((c) => c.name === p.category)?.emoji) || categoryIcon(p.category)}</span>
                    <span className="truncate">{p.category}</span>
                  </div>
                  <div className="text-sm font-semibold leading-tight mt-1 line-clamp-2 h-10">{p.name}</div>
                  <div className="flex items-end justify-between mt-2">
                    <div className="font-mono font-bold text-lg text-slate-900">{formatCOP(p.price)}</div>
                    <Badge variant="outline" className={p.stock <= 5 ? "text-orange-700 border-orange-300" : "text-slate-600"}>
                      {p.stock} {p.unit}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right: cart */}
      <aside className="border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col h-full min-h-[500px] lg:min-h-0 overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-emerald-700" />
              <h3 className="font-bold">Carrito</h3>
              <Badge variant="secondary">{Array.isArray(cart) ? cart.length : 0}</Badge>
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={holdCurrent} disabled={!Array.isArray(cart) || cart.length === 0} data-testid="hold-sale-btn" title="Retener cuenta y atender otro cliente">
                <Pause className="w-4 h-4 mr-1" /> Retener
              </Button>
              {Array.isArray(cart) && cart.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCart} data-testid="clear-cart-btn">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          {Array.isArray(held) && held.length > 0 && (
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1" data-testid="held-accounts-bar">
              <div className="flex items-center gap-1 text-[10px] uppercase font-semibold text-slate-400 shrink-0"><Users className="w-3 h-3" /> Abiertas:</div>
              {held.map((h) => (
                <button
                  key={h.id}
                  onClick={() => resumeHeld(h)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-semibold hover:bg-amber-200 transition"
                  data-testid={`held-${h.id}`}
                  title="Recuperar esta cuenta"
                >
                  <Play className="w-3 h-3" /> {h.label} · {formatCOP(h.total)}
                </button>
              ))}
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          {(!Array.isArray(cart) || cart.length === 0) ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              Agrega productos para iniciar una venta.
            </div>
          ) : (
            <ul className="divide-y">
              {cart.map((it) => (
                <li key={it.product_id} className="p-3">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{it.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{formatCOP(it.price)} c/u</div>
                    </div>
                    <button onClick={() => removeItem(it.product_id)} className="text-slate-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(it.product_id, -1)} data-testid={`dec-${it.product_id}`}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <div className="w-10 text-center font-mono font-semibold">{it.qty}</div>
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(it.product_id, 1)} data-testid={`inc-${it.product_id}`}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="font-mono font-bold">{formatCOP(it.qty * it.price)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <div className="border-t bg-slate-50 p-4 space-y-1.5">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span className="font-mono">{formatCOP(totals.subtotal - totals.tax)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>IVA</span>
            <span className="font-mono">{formatCOP(totals.tax)}</span>
          </div>
          {totals.promo > 0 && (
            <div className="flex justify-between text-sm text-amber-700 font-semibold" data-testid="promo-line">
              <span>🏷 Promoción</span>
              <span className="font-mono">-{formatCOP(totals.promo)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
            <span>Total</span>
            <span className="font-mono text-emerald-700" data-testid="cart-total">{formatCOP(totals.total)}</span>
          </div>
          <Button
            className="w-full h-12 bg-emerald-700 hover:bg-emerald-800 mt-2 text-base font-bold flex items-center justify-center gap-2"
            disabled={!Array.isArray(cart) || cart.length === 0}
            onClick={() => setPayOpen(true)}
            data-testid="checkout-btn"
          >
            <CircleDollarSign className="w-5 h-5" />
            <span>Cobrar</span>
            <span className="text-xs bg-emerald-800/80 px-1.5 py-0.5 rounded font-mono font-normal">F9</span>
          </Button>
          <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono pt-1">
            <span><kbd className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-600">F2</kbd> Lector</span>
            <span><kbd className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-600">F4</kbd> Vaciar</span>
            <span><kbd className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-600">F9</kbd> Cobrar</span>
          </div>
        </div>
      </aside>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent data-testid="payment-dialog">
          <DialogHeader><DialogTitle>Cobro · {formatCOP(totals.total)}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs uppercase font-semibold tracking-wider text-slate-500">Método de pago</label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {["efectivo", "nequi", "daviplata", "tarjeta", "transferencia", "credito"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayment(m)}
                    className={`h-11 rounded-md border text-sm font-semibold capitalize transition ${payment === m ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"}`}
                    data-testid={`pay-${m}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {payment === "credito" && (
              <div>
                <label className="text-xs uppercase font-semibold tracking-wider text-slate-500">Cliente (fiado)</label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-11" data-testid="credit-customer-select"><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
                  <SelectContent>
                    {(Array.isArray(customers) ? customers : []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.document ? ` · ${c.document}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-amber-700 mt-1">💡 La venta quedará con saldo pendiente y aparecerá en Créditos.</div>
              </div>
            )}
            {payment === "efectivo" && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs uppercase font-semibold tracking-wider text-slate-500">Recibido</label>
                  <Input value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 font-mono text-lg" data-testid="received-input" />
                  {received && (
                    <div className={`mt-1 text-sm ${change >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      Cambio: <span className="font-mono font-bold">{formatCOP(change)}</span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 font-medium mb-1">Billetes rápidos</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-semibold bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                      onClick={() => setReceived(String(totals.total))}
                    >
                      Exacto ({formatCOP(totals.total)})
                    </Button>
                    {[10000, 20000, 50000, 100000].map((amt) => (
                      <Button
                        key={amt}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-mono font-medium"
                        onClick={() => setReceived(String(amt))}
                      >
                        {formatCOP(amt)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button onClick={checkout} className="bg-emerald-700 hover:bg-emerald-800" data-testid="confirm-checkout-btn">Confirmar venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      <Dialog open={!!receiptSale} onOpenChange={(v) => !v && setReceiptSale(null)}>
        <DialogContent data-testid="receipt-dialog">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle>Recibo {receiptSale?.number}</DialogTitle>
              {receiptSale?.is_offline && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
                  Modo Offline
                </Badge>
              )}
            </div>
          </DialogHeader>
          {receiptSale && (
            <div className="receipt p-4 rounded text-sm">
              <div className="text-center mb-2">
                <div className="font-bold">JRPOS · Tienda</div>
                <div className="text-xs">{new Date(receiptSale.created_at).toLocaleString("es-CO")}</div>
                <div className="text-xs">
                  Factura POS: {receiptSale.number}
                  {receiptSale.is_offline ? " (Local)" : ""}
                </div>
              </div>
              <hr className="my-2 border-dashed" />
              {(Array.isArray(receiptSale.items) ? receiptSale.items : []).map((it) => (
                <div key={it.product_id} className="flex justify-between">
                  <span className="truncate">{it.qty}x {it.name}</span>
                  <span>{formatCOP(it.subtotal)}</span>
                </div>
              ))}
              <hr className="my-2 border-dashed" />
              <div className="flex justify-between font-bold">
                <span>TOTAL</span>
                <span>{formatCOP(receiptSale.total)}</span>
              </div>
              <div className="text-xs mt-1">Pago: {receiptSale.payment_method}</div>
              <div className="text-center text-xs mt-3">¡Gracias por su compra!</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptSale(null)}>Cerrar</Button>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await printThermal({
                    title: "JRPOS",
                    subtitle: "Tienda",
                    meta: [
                      `Factura: ${receiptSale.number}`,
                      new Date(receiptSale.created_at).toLocaleString("es-CO"),
                      `Pago: ${receiptSale.payment_method}`,
                    ],
                    items: receiptSale.items.map((it) => ({
                      name: it.name, qty: it.qty, price: formatCOP(it.price), total: formatCOP(it.subtotal),
                    })),
                    totals: [["TOTAL", formatCOP(receiptSale.total)]],
                    footer: "¡Gracias por su compra!",
                  });
                  toast.success("Enviado a la impresora");
                } catch (e) { toast.error(e.message || "Error de impresión"); }
              }}
              data-testid="print-receipt-btn"
            >🖨 Imprimir 58mm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

