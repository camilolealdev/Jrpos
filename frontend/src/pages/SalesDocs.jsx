import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ArrowRightLeft, Trash2, ShieldQuestion, FileDown, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { exportDocPdf } from "@/lib/pdfExport";

const CFG = {
  cotizaciones: { kind: "quotes", title: "Cotizaciones", statuses: ["borrador", "enviada", "aceptada", "vencida"] },
  remisiones: { kind: "remissions", title: "Remisiones", statuses: ["pendiente", "entregada", "anulada"] },
  cuentas: { kind: "collection_accounts", title: "Cuentas de Cobro", statuses: ["pendiente", "pagada", "anulada"], simple: true },
  notas: { title: "Notas Crédito/Débito" },
  garantias: { title: "Garantías y Devoluciones" },
};

function ItemsEditor({ items, setItems, products, priceField = "price" }) {
  const [pid, setPid] = useState("");
  const safeProducts = Array.isArray(products) ? products : [];
  const safeItems = Array.isArray(items) ? items : [];
  const add = () => {
    const p = safeProducts.find((x) => x.id === pid);
    if (!p) return;
    setItems([...safeItems, { product_id: p.id, name: p.name, barcode: p.barcode, qty: 1, price: p.price, cost: p.cost, tax_rate: p.tax_rate }]);
    setPid("");
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={pid} onValueChange={setPid}>
          <SelectTrigger className="flex-1" data-testid="item-product"><SelectValue placeholder="Producto..." /></SelectTrigger>
          <SelectContent>{safeProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatCOP(priceField === "cost" ? p.cost : p.price)}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={add} data-testid="add-item-btn"><Plus className="w-4 h-4" /></Button>
      </div>
      {safeItems.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate">{it.name}</span>
          <Input type="number" value={it.qty} onChange={(e) => { const c = [...safeItems]; c[i].qty = Number(e.target.value); setItems(c); }} className="w-16 h-8 text-right font-mono" />
          <span className="font-mono w-24 text-right">{formatCOP((Number(it.qty) || 0) * (priceField === "cost" ? (Number(it.cost) || 0) : (Number(it.price) || 0)))}</span>
          <Button size="icon" variant="ghost" onClick={() => setItems(safeItems.filter((_, x) => x !== i))}><Trash2 className="w-3 h-3 text-red-600" /></Button>
        </div>
      ))}
    </div>
  );
}

export default function SalesDocs({ defaultTab = "cotizaciones" }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(defaultTab);
  const [docs, setDocs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [warranties, setWarranties] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState([]);
  const [saleId, setSaleId] = useState("");
  const [noteType, setNoteType] = useState("credito");
  const [reason, setReason] = useState("");

  useEffect(() => {
    api.get("/products").then((r) => setProducts(Array.isArray(r.data) ? r.data : [])).catch(() => setProducts([]));
    api.get("/contacts", { params: { kind: "customer" } }).then((r) => setCustomers(Array.isArray(r.data) ? r.data : [])).catch(() => setCustomers([]));
    api.get("/sales").then((r) => setSales(Array.isArray(r.data) ? r.data : [])).catch(() => setSales([]));
  }, []);

  const load = useCallback(async () => {
    const cfg = CFG[tab];
    try {
      if (cfg?.kind) {
        const r = await api.get(`/docs/${cfg.kind}`);
        setDocs(Array.isArray(r.data) ? r.data : []);
      }
      if (tab === "notas") {
        const r = await api.get("/credit-notes");
        setNotes(Array.isArray(r.data) ? r.data : []);
      }
      if (tab === "garantias") {
        const r = await api.get("/warranties");
        setWarranties(Array.isArray(r.data) ? r.data : []);
      }
    } catch {
      setDocs([]); setNotes([]); setWarranties([]);
    }
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const cfg = CFG[tab] || {};

  const save = async () => {
    try {
      const safeSales = Array.isArray(sales) ? sales : [];
      const safeCustomers = Array.isArray(customers) ? customers : [];
      const safeItems = Array.isArray(items) ? items : [];

      if (tab === "notas") {
        if (!saleId) return toast.error("Selecciona la venta");
        await api.post("/credit-notes", { sale_id: saleId, type: noteType, restock: true });
      } else if (tab === "garantias") {
        if (!saleId || !reason) return toast.error("Venta y motivo requeridos");
        const sale = safeSales.find((s) => s.id === saleId);
        await api.post("/warranties", { sale_id: saleId, sale_number: sale?.number, product_name: reason, reason });
      } else if (cfg.simple) {
        if (!customerId || !amount) return toast.error("Cliente y monto requeridos");
        await api.post(`/docs/${cfg.kind}`, { customer_id: customerId, customer_name: safeCustomers.find((c) => c.id === customerId)?.name, amount: Number(amount) });
      } else {
        if (safeItems.length === 0) return toast.error("Agrega productos");
        await api.post(`/docs/${cfg.kind}`, { customer_id: customerId || undefined, customer_name: safeCustomers.find((c) => c.id === customerId)?.name, items: safeItems });
      }
      toast.success("Documento creado"); setOpen(false); setItems([]); setAmount(""); setSaleId(""); setReason(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const convert = async (d) => {
    try {
      const { data } = await api.post(`/docs/${cfg.kind}/${d.id}/convert`);
      toast.success(`Convertida a venta ${data.number}`); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const loadIntoPos = (d) => {
    let parsedItems = [];
    if (typeof d.items === "string") {
      try { parsedItems = JSON.parse(d.items); } catch {}
    } else if (Array.isArray(d.items)) {
      parsedItems = d.items;
    }
    if (parsedItems.length === 0) {
      return toast.error("El documento no contiene productos");
    }
    navigate("/pos", {
      state: {
        loadItems: parsedItems,
        customerId: d.customer_id,
        customerName: d.customer_name,
        docOrigin: `${cfg.title || "Documento"} ${d.number}`,
      },
    });
    toast.success(`Cargando ${parsedItems.length} producto(s) en el POS...`);
  };
  const setStatus = async (d, st) => { await api.put(`/docs/${cfg.kind}/${d.id}`, { status: st }); load(); };
  const setWarrantyStatus = async (w, st) => { await api.put(`/warranties/${w.id}`, { status: st, resolution: w.resolution }); load(); };

  const rawList = tab === "notas" ? notes : tab === "garantias" ? warranties : docs;
  const listData = Array.isArray(rawList) ? rawList : [];
  const safeSales = Array.isArray(sales) ? sales : [];
  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeProducts = Array.isArray(products) ? products : [];

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="sales-docs-page">
      <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><ShieldQuestion className="w-6 h-6 text-emerald-700" /> Documentos de Venta</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          {Object.entries(CFG).map(([k, c]) => <TabsTrigger key={k} value={k} data-testid={`tab-${k}`}>{c.title}</TabsTrigger>)}
        </TabsList>

        <TabsContent value={tab} className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-doc-btn"><Plus className="w-4 h-4 mr-1" /> Nuevo</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b"><tr className="text-left">
                    <th className="p-3">N°</th><th className="p-3">{tab === "notas" ? "Venta" : "Cliente/Detalle"}</th>
                    <th className="p-3">Fecha</th><th className="p-3 text-right">Total</th><th className="p-3">Estado</th><th></th>
                  </tr></thead>
                  <tbody>
                    {listData.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-400">Sin documentos.</td></tr>
                    ) : listData.map((d) => (
                      <tr key={d.id} className="border-b hover:bg-slate-50" data-testid={`doc-${d.id}`}>
                        <td className="p-3 font-mono">{d.number}</td>
                        <td className="p-3">{d.customer_name || d.sale_number || d.product_name || "-"}</td>
                        <td className="p-3">{formatDate(d.created_at)}</td>
                        <td className="p-3 text-right font-mono">{formatCOP(d.total || d.amount)}</td>
                        <td className="p-3"><Badge variant="outline" className="capitalize">{d.status}{d.type ? ` · ${d.type}` : ""}</Badge></td>
                        <td className="p-3 text-right whitespace-nowrap">
                          {cfg.kind && (
                            <Button size="sm" variant="outline" onClick={() => exportDocPdf(d)} data-testid={`pdf-${d.id}`}><FileDown className="w-3 h-3 mr-1" /> PDF</Button>
                          )}
                          {cfg.kind && tab !== "cuentas" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => loadIntoPos(d)}
                              title="Cargar productos directamente al carrito del POS"
                              data-testid={`load-pos-${d.id}`}
                              className="text-emerald-700 hover:text-emerald-800 border-emerald-300 dark:border-emerald-700"
                            >
                              <ShoppingCart className="w-3 h-3 mr-1 text-emerald-600" /> Cargar al POS
                            </Button>
                          )}
                          {cfg.kind && tab !== "cuentas" && !["convertida", "anulada"].includes(d.status) && (
                            <Button size="sm" variant="outline" onClick={() => convert(d)} data-testid={`convert-${d.id}`}><ArrowRightLeft className="w-3 h-3 mr-1" /> A venta</Button>
                          )}
                          {cfg.statuses && d.status !== "convertida" && (
                            <Select value={d.status} onValueChange={(v) => tab === "garantias" ? setWarrantyStatus(d, v) : setStatus(d, v)}>
                              <SelectTrigger className="h-8 w-32 inline-flex ml-2"><SelectValue /></SelectTrigger>
                              <SelectContent>{(tab === "garantias" ? ["abierta", "en_proceso", "resuelta", "rechazada"] : cfg.statuses).map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="doc-form">
          <DialogHeader><DialogTitle>Nuevo: {cfg.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {tab === "notas" || tab === "garantias" ? (
              <>
                <div><label className="text-xs font-semibold">Venta origen</label>
                  <Select value={saleId} onValueChange={setSaleId}>
                    <SelectTrigger data-testid="d-sale"><SelectValue placeholder="Selecciona venta..." /></SelectTrigger>
                    <SelectContent>{safeSales.map((s) => <SelectItem key={s.id} value={s.id}>{s.number} · {formatCOP(s.total)}</SelectItem>)}</SelectContent>
                  </Select></div>
                {tab === "notas" ? (
                  <div><label className="text-xs font-semibold">Tipo</label>
                    <Select value={noteType} onValueChange={setNoteType}>
                      <SelectTrigger data-testid="d-notetype"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="credito">Nota Crédito (devolución, re-ingresa stock)</SelectItem><SelectItem value="debito">Nota Débito (cargo adicional)</SelectItem></SelectContent>
                    </Select></div>
                ) : (
                  <div><label className="text-xs font-semibold">Producto / Motivo</label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} data-testid="d-reason" /></div>
                )}
              </>
            ) : (
              <>
                <div><label className="text-xs font-semibold">Cliente</label>
                  <Select value={customerId} onValueChange={setCustomerId}>
                    <SelectTrigger data-testid="d-customer"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                    <SelectContent>{safeCustomers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                {cfg.simple ? (
                  <div><label className="text-xs font-semibold">Monto</label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" data-testid="d-amount" /></div>
                ) : (
                  <ItemsEditor items={items} setItems={setItems} products={safeProducts} />
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-doc-btn">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
