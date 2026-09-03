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
import { toast } from "sonner";
import { Plus, ArrowRightLeft, Trash2, ShieldQuestion } from "lucide-react";

const CFG = {
  cotizaciones: { kind: "quotes", title: "Cotizaciones", statuses: ["borrador", "enviada", "aceptada", "vencida"] },
  remisiones: { kind: "remissions", title: "Remisiones", statuses: ["pendiente", "entregada", "anulada"] },
  cuentas: { kind: "collection_accounts", title: "Cuentas de Cobro", statuses: ["pendiente", "pagada", "anulada"], simple: true },
  notas: { title: "Notas Crédito/Débito" },
  garantias: { title: "Garantías y Devoluciones" },
};

function ItemsEditor({ items, setItems, products, priceField = "price" }) {
  const [pid, setPid] = useState("");
  const add = () => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    setItems([...items, { product_id: p.id, name: p.name, barcode: p.barcode, qty: 1, price: p.price, cost: p.cost, tax_rate: p.tax_rate }]);
    setPid("");
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={pid} onValueChange={setPid}>
          <SelectTrigger className="flex-1" data-testid="item-product"><SelectValue placeholder="Producto..." /></SelectTrigger>
          <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {formatCOP(priceField === "cost" ? p.cost : p.price)}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" onClick={add} data-testid="add-item-btn"><Plus className="w-4 h-4" /></Button>
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate">{it.name}</span>
          <Input type="number" value={it.qty} onChange={(e) => { const c = [...items]; c[i].qty = Number(e.target.value); setItems(c); }} className="w-16 h-8 text-right font-mono" />
          <span className="font-mono w-24 text-right">{formatCOP(it.qty * (priceField === "cost" ? it.cost : it.price))}</span>
          <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, x) => x !== i))}><Trash2 className="w-3 h-3 text-red-600" /></Button>
        </div>
      ))}
    </div>
  );
}

export default function SalesDocs({ defaultTab = "cotizaciones" }) {
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
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/contacts", { params: { kind: "customer" } }).then((r) => setCustomers(r.data));
    api.get("/sales").then((r) => setSales(r.data));
  }, []);

  const load = useCallback(async () => {
    const cfg = CFG[tab];
    if (cfg.kind) setDocs((await api.get(`/docs/${cfg.kind}`)).data);
    if (tab === "notas") setNotes((await api.get("/credit-notes")).data);
    if (tab === "garantias") setWarranties((await api.get("/warranties")).data);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const cfg = CFG[tab];

  const save = async () => {
    try {
      if (tab === "notas") {
        if (!saleId) return toast.error("Selecciona la venta");
        await api.post("/credit-notes", { sale_id: saleId, type: noteType, restock: true });
      } else if (tab === "garantias") {
        if (!saleId || !reason) return toast.error("Venta y motivo requeridos");
        const sale = sales.find((s) => s.id === saleId);
        await api.post("/warranties", { sale_id: saleId, sale_number: sale?.number, product_name: reason, reason });
      } else if (cfg.simple) {
        if (!customerId || !amount) return toast.error("Cliente y monto requeridos");
        await api.post(`/docs/${cfg.kind}`, { customer_id: customerId, customer_name: customers.find((c) => c.id === customerId)?.name, amount: Number(amount) });
      } else {
        if (items.length === 0) return toast.error("Agrega productos");
        await api.post(`/docs/${cfg.kind}`, { customer_id: customerId || undefined, customer_name: customers.find((c) => c.id === customerId)?.name, items });
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
  const setStatus = async (d, st) => { await api.put(`/docs/${cfg.kind}/${d.id}`, { status: st }); load(); };
  const setWarrantyStatus = async (w, st) => { await api.put(`/warranties/${w.id}`, { status: st, resolution: w.resolution }); load(); };

  const listData = tab === "notas" ? notes : tab === "garantias" ? warranties : docs;

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
                    <SelectContent>{sales.map((s) => <SelectItem key={s.id} value={s.id}>{s.number} · {formatCOP(s.total)}</SelectItem>)}</SelectContent>
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
                    <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                {cfg.simple ? (
                  <div><label className="text-xs font-semibold">Monto</label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="font-mono" data-testid="d-amount" /></div>
                ) : (
                  <ItemsEditor items={items} setItems={setItems} products={products} />
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
