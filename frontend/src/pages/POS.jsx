import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { categoryIcon } from "@/lib/categoryIcons";
import { printThermal } from "@/lib/thermalPrint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Search, Trash2, Plus, Minus, ScanLine, ShoppingCart, CircleDollarSign, X, Package as PackageIcon } from "lucide-react";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]); // multi-select; [] = todas
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [payment, setPayment] = useState("efectivo");
  const [received, setReceived] = useState("");
  const [receiptSale, setReceiptSale] = useState(null);
  const barcodeRef = useRef(null);

  const load = async () => {
    const params = { q: q || undefined };
    if (selectedCats.length > 0) params.categories = selectedCats.join(",");
    const { data } = await api.get("/products", { params });
    setProducts(data);
  };
  const loadCats = async () => {
    const { data } = await api.get("/categories");
    setCategories(data);
  };
  const loadCustomers = async () => {
    const { data } = await api.get("/contacts", { params: { kind: "customer" } });
    setCustomers(data);
  };
  useEffect(() => { load(); }, [q, selectedCats]);
  useEffect(() => { loadCats(); loadCustomers(); }, []);

  const toggleCat = (name) => {
    setSelectedCats((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]);
  };

  const addToCart = (p) => {
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

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, x) => s + x.qty * x.price, 0);
    const tax = cart.reduce((s, x) => s + (x.qty * x.price) * (x.tax_rate / 100) / (1 + x.tax_rate / 100), 0);
    return { subtotal, tax, total: subtotal };
  }, [cart]);

  const onBarcodeSubmit = async (e) => {
    e.preventDefault();
    const code = barcodeRef.current?.value?.trim();
    if (!code) return;
    try {
      const { data } = await api.get(`/products/barcode/${encodeURIComponent(code)}`);
      addToCart(data);
      barcodeRef.current.value = "";
    } catch {
      toast.error("Producto no encontrado por código");
    }
  };

  const checkout = async () => {
    if (cart.length === 0) return;
    if (payment === "credito" && !customerId) return toast.error("Selecciona un cliente para venta a crédito");
    try {
      const items = cart.map((c) => ({ ...c, subtotal: c.qty * c.price }));
      const customer = customers.find((x) => x.id === customerId);
      const { data } = await api.post("/sales", {
        items,
        payment_method: payment,
        customer_id: customerId || undefined,
        customer_name: customer?.name || undefined,
      });
      setReceiptSale(data);
      setPayOpen(false);
      setCart([]);
      setReceived("");
      setCustomerId("");
      toast.success(`Venta ${data.number} registrada${data.is_credit ? " a crédito" : ""}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error registrando venta");
    }
  };

  const change = Number(received || 0) - totals.total;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-0" data-testid="pos-page">
      {/* Left: product grid */}
      <div className="p-3 lg:p-5 flex flex-col min-h-0">
        <div className="flex flex-col sm:flex-row gap-2 mb-2">
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
              placeholder="Escanea código de barras..."
              className="pl-9 h-11 font-mono"
              data-testid="pos-barcode-input"
              autoFocus
            />
          </form>
        </div>

        {/* Category chips - dinámicas desde inventario con multi-select e iconos */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 -mx-1 px-1 items-center" data-testid="pos-category-chips">
          <button
            onClick={() => setSelectedCats([])}
            className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border transition ${selectedCats.length === 0 ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-slate-700 border-slate-200 hover:border-emerald-400"}`}
            data-testid="pos-cat-all"
          >
            🛍️ Todas · {categories.reduce((s, c) => s + (c.count || 0), 0)}
          </button>
          {categories.map((c) => {
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
          {products.length === 0 ? (
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
                    <span>{(categories.find((c) => c.name === p.category)?.emoji) || categoryIcon(p.category)}</span>
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
      <aside className="border-l border-slate-200 bg-white flex flex-col h-full min-h-[60vh] lg:min-h-0 lg:h-screen lg:sticky lg:top-0">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold">Carrito</h3>
            <Badge variant="secondary">{cart.length}</Badge>
          </div>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart} data-testid="clear-cart-btn">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
        <ScrollArea className="flex-1">
          {cart.length === 0 ? (
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
          <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
            <span>Total</span>
            <span className="font-mono text-emerald-700" data-testid="cart-total">{formatCOP(totals.total)}</span>
          </div>
          <Button
            className="w-full h-12 bg-emerald-700 hover:bg-emerald-800 mt-2 text-base font-bold"
            disabled={cart.length === 0}
            onClick={() => setPayOpen(true)}
            data-testid="checkout-btn"
          >
            <CircleDollarSign className="w-5 h-5 mr-1" /> Cobrar
          </Button>
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
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}{c.document ? ` · ${c.document}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-amber-700 mt-1">💡 La venta quedará con saldo pendiente y aparecerá en Créditos.</div>
              </div>
            )}
            {payment === "efectivo" && (
              <div>
                <label className="text-xs uppercase font-semibold tracking-wider text-slate-500">Recibido</label>
                <Input value={received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ""))} className="h-11 font-mono text-lg" data-testid="received-input" />
                {received && (
                  <div className={`mt-1 text-sm ${change >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    Cambio: <span className="font-mono font-bold">{formatCOP(change)}</span>
                  </div>
                )}
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
          <DialogHeader><DialogTitle>Recibo {receiptSale?.number}</DialogTitle></DialogHeader>
          {receiptSale && (
            <div className="receipt p-4 rounded text-sm">
              <div className="text-center mb-2">
                <div className="font-bold">AbarrotesPOS · Tienda</div>
                <div className="text-xs">{new Date(receiptSale.created_at).toLocaleString("es-CO")}</div>
                <div className="text-xs">Factura POS: {receiptSale.number}</div>
              </div>
              <hr className="my-2 border-dashed" />
              {receiptSale.items.map((it) => (
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
                    title: "AbarrotesPOS",
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

