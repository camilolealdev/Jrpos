import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PiggyBank, Lock, Unlock, ArrowDownToLine, History, Calculator, Printer, CheckCircle2, AlertCircle, Coins, Banknote } from "lucide-react";

const INITIAL_DENOMINATIONS = {
  "100000": 0,
  "50000": 0,
  "20000": 0,
  "10000": 0,
  "5000": 0,
  "2000": 0,
  "1000": 0,
  "coin_1000": 0,
  "500": 0,
  "200": 0,
  "100": 0,
  "50": 0,
};

const BILL_CONFIG = [
  { key: "100000", value: 100000, label: "$100.000" },
  { key: "50000", value: 50000, label: "$50.000" },
  { key: "20000", value: 20000, label: "$20.000" },
  { key: "10000", value: 10000, label: "$10.000" },
  { key: "5000", value: 5000, label: "$5.000" },
  { key: "2000", value: 2000, label: "$2.000" },
  { key: "1000", value: 1000, label: "$1.000" },
];

const COIN_CONFIG = [
  { key: "coin_1000", value: 1000, label: "$1.000 (Moneda)" },
  { key: "500", value: 500, label: "$500" },
  { key: "200", value: 200, label: "$200" },
  { key: "100", value: 100, label: "$100" },
  { key: "50", value: 50, label: "$50" },
];

export default function CashPickup() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [base, setBase] = useState("");
  const [pickupAmt, setPickupAmt] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [calcMode, setCalcMode] = useState("calculator"); // "calculator" | "direct"
  const [denominations, setDenominations] = useState(INITIAL_DENOMINATIONS);
  const [directCounted, setDirectCounted] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeResult, setCloseResult] = useState(null);

  const [storeSettings, setStoreSettings] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jrpos_settings")) || {}; } catch { return {}; }
  });

  const load = useCallback(async () => {
    try {
      const [c, h, s] = await Promise.all([
        api.get("/cash/current"),
        api.get("/cash/history"),
        api.get("/settings/general").catch(() => ({ data: null })),
      ]);
      setCurrent(c.data && typeof c.data === "object" ? c.data : null);
      setHistory(Array.isArray(h.data) ? h.data : []);
      if (s?.data) {
        setStoreSettings(s.data);
        localStorage.setItem("jrpos_settings", JSON.stringify(s.data));
      }
    } catch {
      setCurrent(null);
      setHistory([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const safeHistory = Array.isArray(history) ? history : [];

  // Calcular total de denominaciones
  const denominationTotal = Object.entries(denominations).reduce((sum, [k, count]) => {
    const qty = Number(count) || 0;
    if (k === "coin_1000") return sum + qty * 1000;
    const val = Number(k) || 0;
    return sum + qty * val;
  }, 0);

  const finalCountedAmount = calcMode === "calculator" ? denominationTotal : (Number(directCounted) || 0);

  const updateDenomination = (key, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setDenominations((prev) => ({ ...prev, [key]: num }));
  };

  const open = async () => {
    try {
      await api.post("/cash/open", { base: Number(base) || 0 });
      toast.success("Caja abierta con éxito");
      setBase(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error abriendo caja"); }
  };

  const pickup = async () => {
    try {
      await api.post("/cash/pickup", { amount: Number(pickupAmt), notes: pickupNote });
      toast.success(`Recogida de ${formatCOP(pickupAmt)} registrada`);
      setPickupAmt(""); setPickupNote(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error registrando recogida"); }
  };

  const close = async () => {
    try {
      const payload = {
        counted: finalCountedAmount,
        denominations: calcMode === "calculator" ? denominations : undefined,
        close_notes: closeNotes.trim() || undefined,
      };
      const { data } = await api.post("/cash/close", payload);
      setCloseResult(data);
      setCloseOpen(false);
      setDenominations(INITIAL_DENOMINATIONS);
      setDirectCounted("");
      setCloseNotes("");
      load();
      toast.success("Caja cerrada correctamente");
    } catch (e) { toast.error(e?.response?.data?.detail || "Error cerrando caja"); }
  };

  const printClosingTicket = () => {
    window.print();
  };

  const [zReportData, setZReportData] = useState(null);
  const [loadingZReport, setLoadingZReport] = useState(false);

  const viewZReport = async (sessionId) => {
    setLoadingZReport(true);
    try {
      const { data } = await api.get(`/cash/session/${sessionId}/z-report`);
      setZReportData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error obteniendo Reporte Z");
    } finally {
      setLoadingZReport(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl" data-testid="cash-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><PiggyBank className="w-6 h-6 text-emerald-700" /> Caja y Recogidas</h1>
        <p className="text-sm text-slate-500">Apertura con base, recogidas de dinero, calculadora de denominaciones y arqueo ciego.</p>
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
            <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Base</div><div className="font-mono font-bold text-lg">{formatCOP(s?.base || 0)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Ventas efectivo ({current.sales_count || 0})</div><div className="font-mono font-bold text-lg text-emerald-700">{formatCOP(current.sales_total || 0)}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Recogidas</div><div className="font-mono font-bold text-lg text-orange-700">-{formatCOP(current.pickups_total || 0)}</div></CardContent></Card>
            <Card className="border-emerald-300"><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Esperado en caja</div><div className="font-mono font-bold text-xl text-emerald-800" data-testid="expected-cash">{formatCOP(current.expected || 0)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ArrowDownToLine className="w-5 h-5 text-orange-600" /> Registrar recogida</CardTitle></CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-2">
              <Input type="number" placeholder="Monto" value={pickupAmt} onChange={(e) => setPickupAmt(e.target.value)} className="font-mono sm:w-40" data-testid="pickup-amount" />
              <Input placeholder="Motivo (ej: consignación, pago arriendo)" value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} className="flex-1" data-testid="pickup-note" />
              <Button className="bg-orange-600 hover:bg-orange-700" onClick={pickup} data-testid="pickup-btn">Recoger dinero</Button>
            </CardContent>
          </Card>

          {Array.isArray(s?.pickups) && s.pickups.length > 0 && (
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
            <Lock className="w-4 h-4 mr-1" /> Cerrar caja (Arqueo ciego)
          </Button>

          {/* Modal de Cierre de Caja con Calculadora de Denominaciones de Colombia */}
          <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="close-dialog">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5 text-red-600" />
                  <span>Arqueo Ciego de Cierre de Caja</span>
                </DialogTitle>
                <DialogDescription>
                  Cuenta el efectivo físico en billetes y monedas de Colombia. El sistema contrastará el total con las operaciones del turno.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="flex gap-2 border-b pb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={calcMode === "calculator" ? "default" : "outline"}
                    className={calcMode === "calculator" ? "bg-emerald-700 hover:bg-emerald-800 text-xs" : "text-xs"}
                    onClick={() => setCalcMode("calculator")}
                  >
                    <Calculator className="w-3.5 h-3.5 mr-1" /> Conteo por Billetes y Monedas
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={calcMode === "direct" ? "default" : "outline"}
                    className={calcMode === "direct" ? "bg-emerald-700 hover:bg-emerald-800 text-xs" : "text-xs"}
                    onClick={() => setCalcMode("direct")}
                  >
                    Monto Directo
                  </Button>
                </div>

                {calcMode === "calculator" ? (
                  <div className="space-y-4">
                    {/* Billetes */}
                    <div>
                      <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                        <Banknote className="w-4 h-4 text-emerald-700" />
                        <span>Billetes</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {BILL_CONFIG.map((b) => (
                          <div key={b.key} className="p-2 border rounded-lg bg-slate-50">
                            <label className="text-xs font-bold text-slate-700">{b.label}</label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={denominations[b.key] || ""}
                              onChange={(e) => updateDenomination(b.key, e.target.value)}
                              className="mt-1 h-9 font-mono text-sm bg-white"
                              data-testid={`denom-${b.key}`}
                            />
                            <div className="text-[10px] text-right font-mono text-slate-500 mt-0.5">
                              {formatCOP((denominations[b.key] || 0) * b.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Monedas */}
                    <div>
                      <div className="text-xs font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-amber-600" />
                        <span>Monedas</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {COIN_CONFIG.map((c) => (
                          <div key={c.key} className="p-2 border rounded-lg bg-amber-50/50">
                            <label className="text-xs font-bold text-slate-700">{c.label}</label>
                            <Input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={denominations[c.key] || ""}
                              onChange={(e) => updateDenomination(c.key, e.target.value)}
                              className="mt-1 h-9 font-mono text-sm bg-white"
                              data-testid={`denom-${c.key}`}
                            />
                            <div className="text-[10px] text-right font-mono text-slate-500 mt-0.5">
                              {formatCOP((denominations[c.key] || 0) * c.value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold">Total en Efectivo Contado</label>
                    <Input
                      type="number"
                      value={directCounted}
                      onChange={(e) => setDirectCounted(e.target.value)}
                      className="h-12 font-mono text-xl mt-1"
                      placeholder="Ej: 450000"
                      data-testid="counted-input"
                      autoFocus
                    />
                  </div>
                )}

                <div className="p-3 bg-slate-900 text-white rounded-lg flex justify-between items-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Total Físico Contado:</span>
                  <span className="font-mono text-xl font-bold text-emerald-400" data-testid="final-counted-preview">
                    {formatCOP(finalCountedAmount)}
                  </span>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700">Observaciones o Notas de Cierre</label>
                  <Textarea
                    placeholder="Ej: Se entregó base al turno de la tarde, cambio exacto..."
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    className="mt-1 text-xs"
                    rows={2}
                    data-testid="close-notes-input"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCloseOpen(false)}>Cancelar</Button>
                <Button className="bg-red-600 hover:bg-red-700" onClick={close} data-testid="confirm-close-btn">
                  Cerrar Caja Definitivamente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Comprobante Térmico de Cierre */}
          <Dialog open={!!closeResult} onOpenChange={(v) => !v && setCloseResult(null)}>
            <DialogContent className="max-w-md" data-testid="close-result">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Comprobante de Cierre de Caja</span>
                </DialogTitle>
              </DialogHeader>
              {closeResult && (
                <div className="space-y-3">
                  <div className="receipt p-4 rounded text-xs border bg-slate-50 space-y-2">
                    <div className="text-center border-b pb-2">
                      <div className="font-bold text-sm uppercase">{storeSettings?.store_name || "Mi Tienda"}</div>
                      {storeSettings?.store_nit && <div>NIT: {storeSettings.store_nit}</div>}
                      <div className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-wider">Arqueo de Turno / Cierre de Caja</div>
                      <div className="text-[10px] text-slate-500">{new Date(closeResult.closed_at).toLocaleString("es-CO")}</div>
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between"><span>Base inicial:</span><span className="font-mono">{formatCOP(closeResult.base)}</span></div>
                      <div className="flex justify-between"><span>Ventas efectivo ({closeResult.sales_count || 0}):</span><span className="font-mono">{formatCOP(closeResult.sales_total)}</span></div>
                      <div className="flex justify-between"><span>Recogidas ({closeResult.pickups?.length || 0}):</span><span className="font-mono text-orange-700">-{formatCOP(closeResult.pickups_total || 0)}</span></div>
                      <div className="flex justify-between border-t pt-1 font-semibold"><span>Total Esperado:</span><span className="font-mono">{formatCOP(closeResult.expected)}</span></div>
                      <div className="flex justify-between font-semibold"><span>Total Físico Contado:</span><span className="font-mono">{formatCOP(closeResult.counted)}</span></div>
                      
                      <div className={`flex justify-between border-t pt-2 font-bold text-sm ${closeResult.diff === 0 ? "text-emerald-700" : closeResult.diff > 0 ? "text-blue-700" : "text-red-600"}`}>
                        <span>Estado / Diferencia:</span>
                        <span className="font-mono" data-testid="close-diff">
                          {closeResult.diff === 0 ? "CUADRADA ($0)" : closeResult.diff > 0 ? `SOBRANTE (+${formatCOP(closeResult.diff)})` : `FALTANTE (${formatCOP(closeResult.diff)})`}
                        </span>
                      </div>
                    </div>

                    {closeResult.close_notes && (
                      <div className="border-t pt-2 text-[11px] text-slate-600">
                        <span className="font-semibold">Notas: </span>{closeResult.close_notes}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <DialogFooter className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="w-full sm:w-auto" onClick={printClosingTicket}>
                  <Printer className="w-4 h-4 mr-1.5" /> Imprimir Comprobante
                </Button>
                <Button className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800" onClick={() => setCloseResult(null)}>
                  Finalizar Turno
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Modal Reporte Z Detallado */}
      <Dialog open={!!zReportData} onOpenChange={(v) => !v && setZReportData(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" data-testid="z-report-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-700" />
                <span>Reporte Z / Arqueo Fiscal Detallado</span>
              </span>
              <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300">
                Turno Cerrado
              </Badge>
            </DialogTitle>
            <DialogDescription>
              Comprobante de auditoría fiscal, ventas por canal de pago y conciliación de flujo de efectivo.
            </DialogDescription>
          </DialogHeader>
          {zReportData && (
            <div className="space-y-3 receipt p-4 rounded text-xs border bg-slate-50">
              <div className="text-center border-b pb-2">
                <div className="font-bold text-sm uppercase">{storeSettings?.store_name || "Mi Tienda"}</div>
                {storeSettings?.store_nit && <div>NIT: {storeSettings.store_nit}</div>}
                <div className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-wider">REPORTE Z — CIERRE DE TURNO</div>
                <div className="text-[10px] text-slate-500">Cajero: {zReportData.cashier}</div>
                <div className="text-[10px] text-slate-500">
                  Apertura: {new Date(zReportData.opened_at).toLocaleString("es-CO")}
                </div>
                <div className="text-[10px] text-slate-500">
                  Cierre: {zReportData.closed_at ? new Date(zReportData.closed_at).toLocaleString("es-CO") : "En curso"}
                </div>
              </div>

              {/* Ventas por Método de Pago */}
              <div>
                <div className="font-bold text-slate-800 mb-1 uppercase tracking-wide text-[11px] border-b pb-0.5">
                  1. Ventas por Medio de Pago
                </div>
                <div className="space-y-1">
                  {Object.entries(zReportData.by_payment_method || {}).map(([method, info]) => (
                    <div key={method} className="flex justify-between items-center capitalize">
                      <span>{method} ({info.count} ventas):</span>
                      <span className="font-mono font-semibold">{formatCOP(info.total)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center font-bold border-t pt-1 mt-1 text-slate-900">
                  <span>Total Ventas Netas:</span>
                  <span className="font-mono text-emerald-700">{formatCOP(zReportData.totals?.net_sales || 0)}</span>
                </div>
              </div>

              {/* Impuestos y Descuentos */}
              <div className="border-t pt-2">
                <div className="font-bold text-slate-800 mb-1 uppercase tracking-wide text-[11px] border-b pb-0.5">
                  2. Discriminación Fiscal
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Ventas Brutas:</span><span className="font-mono">{formatCOP(zReportData.totals?.gross_sales || 0)}</span></div>
                  <div className="flex justify-between"><span>IVA Recaudado:</span><span className="font-mono">{formatCOP(zReportData.totals?.tax_collected || 0)}</span></div>
                  <div className="flex justify-between"><span>Descuentos / Promos:</span><span className="font-mono text-amber-700">-{formatCOP(zReportData.totals?.discounts || 0)}</span></div>
                </div>
              </div>

              {/* Flujo de Efectivo en Caja */}
              <div className="border-t pt-2">
                <div className="font-bold text-slate-800 mb-1 uppercase tracking-wide text-[11px] border-b pb-0.5">
                  3. Cuadre de Efectivo Físico
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Base Inicial (+):</span><span className="font-mono">{formatCOP(zReportData.cash_flow?.base || 0)}</span></div>
                  <div className="flex justify-between"><span>Ventas Efectivo (+):</span><span className="font-mono">{formatCOP(zReportData.cash_flow?.cash_sales || 0)}</span></div>
                  <div className="flex justify-between"><span>Recogidas / Retiros (-):</span><span className="font-mono text-orange-700">-{formatCOP(zReportData.cash_flow?.pickups_total || 0)}</span></div>
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Saldo Esperado en Caja:</span>
                    <span className="font-mono">{formatCOP(zReportData.cash_flow?.expected_cash || 0)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Efectivo Físico Contado:</span>
                    <span className="font-mono">{formatCOP(zReportData.cash_flow?.counted_cash || 0)}</span>
                  </div>
                  <div className={`flex justify-between font-bold border-t pt-1.5 text-sm ${zReportData.cash_flow?.diff === 0 ? "text-emerald-700" : zReportData.cash_flow?.diff > 0 ? "text-blue-700" : "text-red-600"}`}>
                    <span>Diferencia ({zReportData.cash_flow?.diff_label}):</span>
                    <span className="font-mono">
                      {zReportData.cash_flow?.diff === 0 ? "$0 (Exacto)" : `${zReportData.cash_flow?.diff > 0 ? "+" : ""}${formatCOP(zReportData.cash_flow?.diff)}`}
                    </span>
                  </div>
                </div>
              </div>

              {zReportData.close_notes && (
                <div className="border-t pt-2 text-[11px] text-slate-600">
                  <span className="font-semibold">Observaciones: </span>{zReportData.close_notes}
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1.5" /> Imprimir Reporte Z
            </Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setZReportData(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><History className="w-5 h-5" /> Historial de cierres</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">Fecha</th><th className="p-3">Cajero</th><th className="p-3 text-right">Esperado</th>
                <th className="p-3 text-right">Contado</th><th className="p-3 text-right">Diferencia</th>
                <th className="p-3 text-center">Acciones</th>
              </tr></thead>
              <tbody>
                {safeHistory.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-slate-400">Sin cierres aún.</td></tr>
                ) : safeHistory.map((h) => (
                  <tr key={h.id} className="border-b hover:bg-slate-50">
                    <td className="p-3">{formatDate(h.closed_at)}</td>
                    <td className="p-3">{h.opened_by}</td>
                    <td className="p-3 text-right font-mono">{formatCOP(h.expected)}</td>
                    <td className="p-3 text-right font-mono">{formatCOP(h.counted)}</td>
                    <td className="p-3 text-right">
                      <Badge variant="outline" className={h.diff === 0 ? "bg-emerald-50 text-emerald-800 border-emerald-200" : h.diff > 0 ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-red-50 text-red-700 border-red-200"}>
                        {h.diff === 0 ? "Cuadrada" : `${h.diff > 0 ? "+" : ""}${formatCOP(h.diff)}`}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-medium border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                        onClick={() => viewZReport(h.id)}
                        disabled={loadingZReport}
                        data-testid={`view-z-report-${h.id}`}
                      >
                        <Printer className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                        <span>Reporte Z</span>
                      </Button>
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

