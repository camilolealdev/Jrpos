import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, PackageCheck, Truck, Trash2, FileText } from "lucide-react";

export default function Purchases({ defaultTab = "oc" }) {
  const [tab, setTab] = useState(defaultTab);
  const [orders, setOrders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState([]);
  const [name, setName] = useState(""); const [qty, setQty] = useState(1); const [cost, setCost] = useState("");

  useEffect(() => { api.get("/contacts", { params: { kind: "supplier" } }).then((r) => setSuppliers(r.data)); }, []);
  const load = useCallback(async () => {
    if (tab === "oc") setOrders((await api.get("/purchase-orders")).data);
    else setDocs((await api.get("/support-docs")).data);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const addItem = () => {
    if (!name || !qty) return;
    setItems([...items, { name, qty: Number(qty), cost: Number(cost) || 0, price: Number(cost) || 0 }]);
    setName(""); setQty(1); setCost("");
  };

  const save = async () => {
    try {
      if (tab === "oc") {
        if (items.length === 0) return toast.error("Agrega ítems");
        await api.post("/purchase-orders", { supplier_id: supplierId || undefined, supplier_name: suppliers.find((s) => s.id === supplierId)?.name, items });
      } else {
        if (!name && items.length === 0) return toast.error("Agrega ítems");
        const supplier = suppliers.find((s) => s.id === supplierId);
        await api.post("/support-docs", { supplier_name: supplier?.name || name, supplier_doc: supplier?.document, items });
      }
      toast.success("Creado"); setOpen(false); setItems([]); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const receive = async (o) => {
    try { await api.post(`/purchase-orders/${o.id}/receive`); toast.success(`OC ${o.number} recibida — stock actualizado`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const data = tab === "oc" ? orders : docs;

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="purchases-page">
      <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Truck className="w-6 h-6 text-emerald-700" /> Compras</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="oc" data-testid="tab-oc">Órdenes de Compra</TabsTrigger>
          <TabsTrigger value="ds" data-testid="tab-ds">Documento Soporte</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-po-btn"><Plus className="w-4 h-4 mr-1" /> Nuevo</Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b"><tr className="text-left">
                    <th className="p-3">N°</th><th className="p-3">Proveedor</th><th className="p-3">Fecha</th>
                    <th className="p-3 text-right">Total</th><th className="p-3">Estado</th><th></th>
                  </tr></thead>
                  <tbody>
                    {data.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-400">Sin registros.</td></tr>
                    ) : data.map((d) => (
                      <tr key={d.id} className="border-b hover:bg-slate-50" data-testid={`po-${d.id}`}>
                        <td className="p-3 font-mono">{d.number}</td>
                        <td className="p-3">{d.supplier_name}</td>
                        <td className="p-3">{formatDate(d.created_at)}</td>
                        <td className="p-3 text-right font-mono">{formatCOP(d.total)}</td>
                        <td className="p-3"><Badge variant="outline" className="capitalize">{d.status}</Badge></td>
                        <td className="p-3 text-right">
                          {tab === "oc" && d.status === "enviada" && (
                            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => receive(d)} data-testid={`receive-${d.id}`}>
                              <PackageCheck className="w-3 h-3 mr-1" /> Recibir
                            </Button>
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
        <DialogContent data-testid="po-form">
          <DialogHeader><DialogTitle>{tab === "oc" ? "Nueva Orden de Compra" : "Nuevo Documento Soporte"} <FileText className="inline w-4 h-4" /></DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold">Proveedor</label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger data-testid="po-supplier"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="flex gap-2">
              <Input placeholder="Producto" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" data-testid="po-item-name" />
              <Input type="number" placeholder="Cant" value={qty} onChange={(e) => setQty(e.target.value)} className="w-20 font-mono" data-testid="po-item-qty" />
              <Input type="number" placeholder="Costo" value={cost} onChange={(e) => setCost(e.target.value)} className="w-28 font-mono" data-testid="po-item-cost" />
              <Button variant="outline" onClick={addItem} data-testid="po-add-item"><Plus className="w-4 h-4" /></Button>
            </div>
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2 text-sm border-b pb-1">
                <span className="flex-1">{it.name}</span>
                <span className="font-mono">{it.qty} × {formatCOP(it.cost)}</span>
                <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, x) => x !== i))}><Trash2 className="w-3 h-3 text-red-600" /></Button>
              </div>
            ))}
            {items.length > 0 && <div className="text-right font-mono font-bold">Total: {formatCOP(items.reduce((s, i) => s + i.qty * i.cost, 0))}</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-po-btn">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
