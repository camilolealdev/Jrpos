import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PiggyBank, Lock, Unlock, ArrowDownToLine, History } from "lucide-react";

export default function CashPickup() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [base, setBase] = useState("");
  const [pickupAmt, setPickupAmt] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [counted, setCounted] = useState("");
  const [closeResult, setCloseResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([api.get("/cash/current"), api.get("/cash/history")]);
      setCurrent(c.data); setHistory(h.data);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const open = async () => {
    try {
      await api.post("/cash/open", { base: Number(base) || 0 });
      toast.success("Caja abierta");
      setBase(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const pickup = async () => {
    try {
      await api.post("/cash/pickup", { amount: Number(pickupAmt), notes: pickupNote });
      toast.success(`Recogida de ${formatCOP(pickupAmt)} registrada`);
      setPickupAmt(""); setPickupNote(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const close = async () => {
    try {
      const { data } = await api.post("/cash/close", { counted: Number(counted) });
      setCloseResult(data);
      setCloseOpen(false); setCounted(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const s = current?.session;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl" data-testid="cash-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><PiggyBank className="w-6 h-6 text-emerald-700" /> Caja y Recogidas</h1>
        <p className="text-sm text-slate-500">Apertura con base, recogidas de dinero durante el día y arqueo de cierre.</p>
      </div>

      {!current?.open ? (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Unlock className="w-5 h-5 text-emerald-700" /> Abrir caja</CardTitle></CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <Input type="number" placeholder="Base inicial (ej: 100000)" value={base} onChange={(e) => setBase(e.target.value)} className="font-mono sm:w-64" data-testid="base-input" />
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={open} data-testid="open-cash-btn">Abrir caja del día</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Base</div><div className="font-mono font-bold text-lg">{formatCOP(s.base)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Ventas efectivo ({current.sales_count})</div><div className="font-mono font-bold text-lg text-emerald-700">{formatCOP(current.sales_total)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Recogidas</div><div className="font-mono font-bold text-lg text-orange-700">-{formatCOP(current.pickups_total)}</div></CardContent></Card>
            <Card className="border-emerald-300"><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Esperado en caja</div><div className="font-mono font-bold text-xl text-emerald-800" data-testid="expected-cash">{formatCOP(current.expected)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-orange-600" /> Registrar recogida</CardTitle></CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-2">
              <Input type="number" placeholder="Monto" value={pickupAmt} onChange={(e) => setPickupAmt(e.target.value)} className="font-mono sm:w-40" data-testid="pickup-amount" />
              <Input placeholder="Motivo (ej: consignación, pago arriendo)" value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} className="flex-1" data-testid="pickup-note" />
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={pickup} data-testid="pickup-btn">Recoger dinero</Button>
            </CardContent>
          </Card>

          {s.pickups?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Recogidas de hoy</CardTitle></CardHeader>
              <CardContent className="space-y-1.5">
                {s.pickups.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm border-b border-slate-100 pb-1.5">
                    <span>{formatDate(p.created_at)} · {p.notes || "sin motivo"}</span>
                    <span className="font-mono font-bold text-orange-700">-{formatCOP(p.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setCloseOpen(true)} data-testid="close-cash-btn">
            <Lock className="w-4 h-4 mr-1" /> Cerrar caja (arqueo)
          </Button>

          <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
            <DialogContent data-testid="close-dialog">
              <DialogHeader>
                <DialogTitle>Arqueo de cierre</DialogTitle>
                <DialogDescription>Cuenta el efectivo físico del cajón e ingrésalo. El sistema compara con lo esperado.</DialogDescription>
              </DialogHeader>
              <div>
                <label className="text-xs font-semibold">Efectivo contado</label>
                <Input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} className="h-12 font-mono text-xl" data-testid="counted-input" autoFocus />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button>
                <Button className="bg-red-600 hover:bg-red-700" onClick={close} data-testid="confirm-close-btn">Cerrar caja</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!closeResult} onOpenChange={(v) => !v && setCloseResult(null)}>
            <DialogContent data-testid="close-result">
              <DialogHeader><DialogTitle>Caja cerrada</DialogTitle></DialogHeader>
              {closeResult && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>Base</span><span className="font-mono">{formatCOP(closeResult.base)}</span></div>
                  <div className="flex justify-between"><span>Ventas efectivo</span><span className="font-mono">{formatCOP(closeResult.sales_total)}</span></div>
                  <div className="flex justify-between"><span>Recogidas</span><span className="font-mono">-{formatCOP(closeResult.pickups_total)}</span></div>
                  <div className="flex justify-between border-t pt-2"><span>Esperado</span><span className="font-mono font-bold">{formatCOP(closeResult.expected)}</span></div>
                  <div className="flex justify-between"><span>Contado</span><span className="font-mono">{formatCOP(closeResult.counted)}</span></div>
                  <div className={`flex justify-between border-t pt-2 font-bold ${closeResult.diff === 0 ? "text-emerald-700" : "text-red-600"}`}>
                    <span>Diferencia</span>
                    <span className="font-mono" data-testid="close-diff">{closeResult.diff > 0 ? "+" : ""}{formatCOP(closeResult.diff)}</span>
                  </div>
                </div>
              )}
              <DialogFooter><Button onClick={() => setCloseResult(null)}>Entendido</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5" /> Historial de cierres</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">Fecha</th><th className="p-3">Cajero</th><th className="p-3 text-right">Esperado</th>
                <th className="p-3 text-right">Contado</th><th className="p-3 text-right">Diferencia</th>
              </tr></thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-slate-400">Sin cierres aún.</td></tr>
                ) : history.map((h) => (
                  <tr key={h.id} className="border-b hover:bg-slate-50">
                    <td className="p-3">{formatDate(h.closed_at)}</td>
                    <td className="p-3">{h.opened_by}</td>
                    <td className="p-3 text-right font-mono">{formatCOP(h.expected)}</td>
                    <td className="p-3 text-right font-mono">{formatCOP(h.counted)}</td>
                    <td className="p-3 text-right">
                      <Badge variant="outline" className={h.diff === 0 ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                        {h.diff > 0 ? "+" : ""}{formatCOP(h.diff)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
