import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { HandCoins, User, Wallet, ChevronRight, ArrowLeft, Printer, MessageCircle } from "lucide-react";
import { printThermal } from "@/lib/thermalPrint";

// Normaliza teléfono colombiano a formato wa.me (solo dígitos, código país 57)
export function whatsappUrl(phone, text) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) digits = "57" + digits;
  if (digits.length < 12) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function Credits() {
  const [summary, setSummary] = useState({ customers: [], total_due: 0 });
  const [statement, setStatement] = useState(null);
  const [payFor, setPayFor] = useState(null); // {sale}
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [notes, setNotes] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/credits/summary");
      setSummary(data && Array.isArray(data.customers) ? data : { customers: Array.isArray(data) ? data : [], total_due: data?.total_due || 0 });
    } catch {
      setSummary({ customers: [], total_due: 0 });
    }
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const openStatement = async (customerId) => {
    if (!customerId) return toast.error("Cliente sin identificar");
    try {
      const { data } = await api.get(`/credits/customer/${customerId}`);
      setStatement(data && typeof data === "object" ? data : null);
    } catch {
      toast.error("No se pudo cargar el estado de cuenta");
    }
  };

  const sendReminder = (customer, balance, salesCount, oldestDate) => {
    const msg = `Hola ${customer?.name || ""}, te saluda JRPOS 🏪. Tienes un saldo pendiente de ${formatCOP(balance)} por ${salesCount} factura(s) a crédito. La más antigua es del ${formatDate(oldestDate)}. ¡Gracias por ponerte al día! 🙏`;
    const url = whatsappUrl(customer?.phone, msg);
    if (!url) return toast.error("Este cliente no tiene un celular válido registrado (10 dígitos). Edítalo en Clientes.");
    window.open(url, "_blank");
  };

  const submitPayment = async () => {
    const amt = Number(amount || 0);
    if (amt <= 0) return toast.error("Ingresa un monto válido");
    try {
      const { data: pay } = await api.post("/credits/payment", { sale_id: payFor.id, amount: amt, method, notes });
      toast.success(`Abono de ${formatCOP(amt)} registrado`);
      const newBalance = Math.max(0, (payFor.balance_due || 0) - amt);
      // Try thermal print (opt-in via confirm)
      if (window.confirm("¿Imprimir recibo del abono en impresora térmica?")) {
        try {
          await printThermal({
            title: "ABONO",
            subtitle: pay.customer_name || "",
            meta: [
              `Factura: ${pay.sale_number}`,
              new Date(pay.created_at).toLocaleString("es-CO"),
              `Método: ${pay.method}`,
            ],
            items: [],
            totals: [["Abono", formatCOP(pay.amount)], ["Saldo", formatCOP(newBalance)]],
            footer: "¡Gracias por su pago!",
          });
        } catch (e) { toast.error(e.message || "Error de impresión"); }
      }
      setPayFor(null); setAmount(""); setNotes("");
      loadSummary();
      if (statement?.customer?.id) openStatement(statement.customer.id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error al registrar abono");
    }
  };

  if (statement) {
    const c = statement.customer;
    const statementSales = Array.isArray(statement.sales) ? statement.sales : [];
    const statementPayments = Array.isArray(statement.payments) ? statement.payments : [];

    return (
      <div className="p-4 lg:p-6 space-y-4" data-testid="credit-statement-page">
        <button onClick={() => setStatement(null)} className="flex items-center gap-1 text-sm text-slate-600 hover:text-emerald-700" data-testid="back-to-credits">
          <ArrowLeft className="w-4 h-4" /> Volver a fiados
        </button>
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><User className="w-6 h-6 text-emerald-700" /> {c?.name || "Cliente"}</h1>
            <p className="text-sm text-slate-500 font-mono">{c?.document_type} {c?.document} · {c?.phone || "sin teléfono"}</p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-slate-500">Saldo pendiente</div>
            <div className="text-3xl font-bold font-mono text-orange-700" data-testid="statement-balance">{formatCOP(statement.balance)}</div>
            {statement.balance > 0 && (
              <Button
                size="sm"
                className="mt-2 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => {
                  const oldest = statementSales.filter((s) => s.credit_status !== "paid").map((s) => s.created_at).sort()[0];
                  const pendingCount = statementSales.filter((s) => s.credit_status !== "paid").length;
                  sendReminder(statement.customer, statement.balance, pendingCount, oldest);
                }}
                data-testid="whatsapp-reminder-btn"
              >
                <MessageCircle className="w-4 h-4 mr-1" /> Recordar por WhatsApp
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Total fiado</div><div className="font-mono font-bold text-lg">{formatCOP(statement.total_credit)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Total abonado</div><div className="font-mono font-bold text-lg text-emerald-700">{formatCOP(statement.total_paid)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[11px] uppercase text-slate-500">Facturas</div><div className="font-mono font-bold text-lg">{statementSales.length}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-lg">Ventas a crédito</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr className="text-left">
                  <th className="p-3">N°</th><th className="p-3">Fecha</th>
                  <th className="p-3 text-right">Total</th><th className="p-3 text-right">Saldo</th>
                  <th className="p-3">Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {statementSales.length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-slate-400">Sin ventas a crédito.</td></tr>
                  ) : statementSales.map((s) => (
                    <tr key={s.id} className="border-b hover:bg-slate-50" data-testid={`credit-sale-${s.id}`}>
                      <td className="p-3 font-mono">{s.number}</td>
                      <td className="p-3">{formatDate(s.created_at)}</td>
                      <td className="p-3 text-right font-mono">{formatCOP(s.total)}</td>
                      <td className="p-3 text-right font-mono font-bold text-orange-700">{formatCOP(s.balance_due)}</td>
                      <td className="p-3">
                        <Badge className={
                          s.credit_status === "paid" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                          s.credit_status === "partial" ? "bg-amber-100 text-amber-800 border-amber-200" :
                          "bg-orange-100 text-orange-800 border-orange-200"
                        } variant="outline">
                          {s.credit_status === "paid" ? "Pagada" : s.credit_status === "partial" ? "Parcial" : "Pendiente"}
                        </Badge>
                      </td>
                      <td className="p-3 text-right">
                        {s.credit_status !== "paid" && (
                          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setPayFor(s)} data-testid={`pay-btn-${s.id}`}>
                            <Wallet className="w-4 h-4 mr-1" /> Abonar
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

        <Card>
          <CardHeader><CardTitle className="text-lg">Historial de abonos</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr className="text-left">
                  <th className="p-3">Fecha</th><th className="p-3">Factura</th>
                  <th className="p-3">Método</th><th className="p-3 text-right">Monto</th>
                </tr></thead>
                <tbody>
                  {statementPayments.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-slate-400">Sin abonos.</td></tr>
                  ) : statementPayments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-3">{formatDate(p.created_at)}</td>
                      <td className="p-3 font-mono">{p.sale_number}</td>
                      <td className="p-3 capitalize">{p.method}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCOP(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={!!payFor} onOpenChange={(v) => !v && setPayFor(null)}>
          <DialogContent data-testid="payment-abono-dialog">
            <DialogHeader>
              <DialogTitle>Registrar abono</DialogTitle>
              <DialogDescription>
                Factura {payFor?.number} · Saldo actual: <span className="font-mono font-bold">{formatCOP(payFor?.balance_due)}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold">Monto del abono</label>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 font-mono text-lg" data-testid="abono-amount" />
                <div className="flex gap-1 mt-1">
                  {[0.25, 0.5, 1].map((p) => (
                    <button key={p} type="button" className="text-xs px-2 py-1 border rounded hover:bg-slate-100"
                      onClick={() => setAmount(String(Math.round((payFor?.balance_due || 0) * p)))}>
                      {p === 1 ? "Saldar" : `${p * 100}%`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold">Método</label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-10" data-testid="abono-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="nequi">Nequi</SelectItem>
                    <SelectItem value="daviplata">Daviplata</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold">Notas (opcional)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayFor(null)}>Cancelar</Button>
              <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={submitPayment} data-testid="confirm-abono-btn">Registrar abono</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const customersList = Array.isArray(summary?.customers) ? summary.customers : [];

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="credits-page">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><HandCoins className="w-6 h-6 text-amber-600" /> Créditos / Fiado</h1>
          <p className="text-sm text-slate-500">Ventas a crédito y estado de cuenta por cliente.</p>
        </div>
        <Card className="min-w-[220px]">
          <CardContent className="p-3">
            <div className="text-[11px] uppercase tracking-widest text-slate-500">Cartera total</div>
            <div className="text-2xl font-bold font-mono text-orange-700" data-testid="total-cartera">{formatCOP(summary?.total_due || 0)}</div>
            <div className="text-xs text-slate-500">{customersList.length} clientes con saldo</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Clientes con saldo pendiente</CardTitle></CardHeader>
        <CardContent className="p-0">
          {customersList.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <HandCoins className="w-8 h-8 mx-auto opacity-40" />
              <p className="mt-2">Nadie tiene fiado pendiente. ¡Excelente!</p>
              <p className="text-xs mt-1">Las ventas con método &quot;crédito&quot; desde el POS aparecerán aquí.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {customersList.map((c) => (
                <li key={c.customer_id || c.customer_name}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 cursor-pointer"
                    onClick={() => openStatement(c.customer_id)}
                    data-testid={`credit-customer-${c.customer_id}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 grid place-items-center shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.customer_name}</div>
                      <div className="text-xs text-slate-500">{c.sales_count} factura(s) · desde {formatDate(c.oldest_date)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      title="Enviar recordatorio por WhatsApp"
                      data-testid={`wa-remind-${c.customer_id}`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        // Buscar teléfono completo del cliente
                        try {
                          const { data: full } = await api.get(`/credits/customer/${c.customer_id}`);
                          sendReminder(full.customer, c.total_due, c.sales_count, c.oldest_date);
                        } catch { toast.error("No se pudo cargar el cliente"); }
                      }}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                    <div className="text-right">
                      <div className="text-[10px] uppercase text-slate-500">Debe</div>
                      <div className="font-mono font-bold text-orange-700">{formatCOP(c.total_due)}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
