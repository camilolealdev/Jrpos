import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Download, Search, TrendingUp, Receipt, DollarSign, Calendar, FileText, Sparkles, Percent } from "lucide-react";
import { toast } from "sonner";
import { printThermal } from "@/lib/thermalPrint";

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [q, setQ] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("todos");
  const [datePreset, setDatePreset] = useState("all"); // "today", "week", "month", "all", "custom"
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exportingTax, setExportingTax] = useState(false);

  useEffect(() => {
    api.get("/sales")
      .then((r) => setSales(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSales([]));

    api.get("/reports/summary")
      .then((r) => setSummaryData(r.data))
      .catch(() => {});
  }, []);

  const reprint = async (s) => {
    try {
      const itemsList = Array.isArray(s?.items) ? s.items : [];
      await printThermal({
        title: "JRPOS",
        subtitle: "REIMPRESIÓN",
        meta: [
          `Factura: ${s?.number || ""}`,
          s?.created_at ? new Date(s.created_at).toLocaleString("es-CO") : "",
          `Pago: ${s?.payment_method || ""}`,
        ],
        items: itemsList.map((it) => ({ name: it.name, qty: it.qty, price: formatCOP(it.price), total: formatCOP(it.subtotal) })),
        totals: [["TOTAL", formatCOP(s?.total || 0)]],
        footer: "¡Gracias por su compra!",
      });
      toast.success("Enviado a la impresora");
    } catch (e) { toast.error(e.message || "Error de impresión"); }
  };

  const filteredSales = useMemo(() => {
    const safeSales = Array.isArray(sales) ? sales : [];
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return safeSales.filter((s) => {
      const matchQuery = !q || (
        (s.number && s.number.toLowerCase().includes(q.toLowerCase())) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(q.toLowerCase()))
      );
      const matchMethod = selectedMethod === "todos" || s.payment_method === selectedMethod;

      let matchDate = true;
      if (s.created_at) {
        const saleDate = new Date(s.created_at);
        if (datePreset === "today") {
          matchDate = saleDate >= startOfToday;
        } else if (datePreset === "week") {
          matchDate = saleDate >= startOfWeek;
        } else if (datePreset === "month") {
          matchDate = saleDate >= startOfMonth;
        } else if (datePreset === "custom") {
          if (startDate) {
            const start = new Date(startDate);
            matchDate = matchDate && saleDate >= start;
          }
          if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            matchDate = matchDate && saleDate <= end;
          }
        }
      }

      return matchQuery && matchMethod && matchDate;
    });
  }, [sales, q, selectedMethod, datePreset, startDate, endDate]);

  const stats = useMemo(() => {
    const totalAmount = filteredSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const totalTax = filteredSales.reduce((acc, s) => acc + (Number(s.tax) || 0), 0);
    const count = filteredSales.length;
    const avgTicket = count > 0 ? totalAmount / count : 0;
    return { totalAmount, totalTax, count, avgTicket };
  }, [filteredSales]);

  const exportCSV = () => {
    if (filteredSales.length === 0) return toast.error("No hay ventas para exportar");
    try {
      const headers = ["Numero_Factura", "Fecha", "Cliente", "Metodo_Pago", "Subtotal_Sin_IVA", "IVA", "Total_COP"];
      const rows = filteredSales.map((s) => [
        `"${s.number || ""}"`,
        `"${s.created_at ? new Date(s.created_at).toISOString() : ""}"`,
        `"${(s.customer_name || "Consumidor Final").replace(/"/g, '""')}"`,
        `"${s.payment_method || ""}"`,
        (Number(s.total) || 0) - (Number(s.tax) || 0),
        Number(s.tax) || 0,
        Number(s.total) || 0,
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `reporte_ventas_jrpos_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Reporte CSV descargado con éxito");
    } catch {
      toast.error("Error al generar archivo CSV");
    }
  };

  const exportAccountingReport = async () => {
    setExportingTax(true);
    try {
      const { data } = await api.get("/reports/accounting-export");
      const csv = data?.csv_export || "";
      if (!csv) throw new Error("No se recibieron datos del reporte contable");

      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `informe_contable_iva_jrpos_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Informe contable e IVA exportado con éxito");
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Error exportando informe contable");
    } finally {
      setExportingTax(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="reports-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Reportes y Contabilidad</h1>
          <p className="text-sm text-slate-500">Historial de facturas, desglose fiscal de IVA y márgenes de ganancia.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={exportAccountingReport} variant="outline" className="border-emerald-300 text-emerald-800 hover:bg-emerald-50" disabled={exportingTax} data-testid="export-accounting-btn">
            <FileText className="w-4 h-4 mr-2 text-emerald-600" />
            <span>Informe Contable e IVA</span>
          </Button>
          <Button onClick={exportCSV} variant="outline" className="shrink-0" data-testid="export-csv-btn">
            <Download className="w-4 h-4 mr-2" /> Exportar Ventas
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Ventas Totales</div>
              <div className="text-lg font-bold text-emerald-700 font-mono">{formatCOP(stats.totalAmount)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 grid place-items-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Ganancia Bruta Real</div>
              <div className="text-lg font-bold text-teal-700 font-mono">
                {formatCOP(summaryData?.gross_profit || 0)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 grid place-items-center">
              <Percent className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Margen Bruto</div>
              <div className="text-lg font-bold text-purple-700 font-mono">
                {summaryData?.gross_margin_percent ?? 0}%
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 grid place-items-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Total IVA Recaudado</div>
              <div className="text-lg font-bold text-amber-800 font-mono">{formatCOP(stats.totalTax)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 grid place-items-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Ticket Promedio</div>
              <div className="text-lg font-bold text-blue-700 font-mono">{formatCOP(stats.avgTicket)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Date Presets & Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b pb-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <span>Rango de Fecha:</span>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {[
                { id: "all", label: "Todo el Historial" },
                { id: "today", label: "Hoy" },
                { id: "week", label: "Esta Semana" },
                { id: "month", label: "Este Mes" },
                { id: "custom", label: "Personalizado" },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => setDatePreset(p.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                    datePreset === p.id
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  data-testid={`date-preset-${p.id}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {datePreset === "custom" && (
            <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-2 rounded-lg text-xs">
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Desde:</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                  data-testid="start-date-filter"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-500">Hasta:</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                  data-testid="end-date-filter"
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por N° factura o cliente..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
                data-testid="search-sales-input"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {["todos", "efectivo", "nequi", "daviplata", "tarjeta", "credito", "transferencia"].map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMethod(m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition ${
                    selectedMethod === m
                      ? "bg-emerald-700 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  data-testid={`filter-${m}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base font-semibold">Listado de Ventas ({filteredSales.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="p-3">N° Factura</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Ítems</th>
                  <th className="p-3">Método</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      No se encontraron ventas que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition" data-testid={`sale-row-${s.id}`}>
                      <td className="p-3 font-mono font-medium text-slate-900">{s.number}</td>
                      <td className="p-3 text-slate-600">{formatDate(s.created_at)}</td>
                      <td className="p-3 text-slate-700 font-medium">{s.customer_name || "Consumidor Final"}</td>
                      <td className="p-3 text-slate-600">{Array.isArray(s?.items) ? s.items.length : 0}</td>
                      <td className="p-3">
                        <Badge variant="outline" className="capitalize bg-white font-medium">
                          {s.payment_method}
                        </Badge>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCOP(s.total)}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => reprint(s)} data-testid={`reprint-${s.id}`}>
                          <Printer className="w-3.5 h-3.5 mr-1" /> Reimprimir
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

