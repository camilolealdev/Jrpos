import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Printer, Download, Search, TrendingUp, Receipt, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { printThermal } from "@/lib/thermalPrint";

export default function Reports() {
  const [sales, setSales] = useState([]);
  const [q, setQ] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("todos");

  useEffect(() => {
    api.get("/sales")
      .then((r) => setSales(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSales([]));
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

  const safeSales = Array.isArray(sales) ? sales : [];

  const filteredSales = useMemo(() => {
    return safeSales.filter((s) => {
      const matchQuery = !q || (
        (s.number && s.number.toLowerCase().includes(q.toLowerCase())) ||
        (s.customer_name && s.customer_name.toLowerCase().includes(q.toLowerCase()))
      );
      const matchMethod = selectedMethod === "todos" || s.payment_method === selectedMethod;
      return matchQuery && matchMethod;
    });
  }, [safeSales, q, selectedMethod]);

  const stats = useMemo(() => {
    const totalAmount = filteredSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
    const count = filteredSales.length;
    const avgTicket = count > 0 ? totalAmount / count : 0;
    return { totalAmount, count, avgTicket };
  }, [filteredSales]);

  const exportCSV = () => {
    if (filteredSales.length === 0) return toast.error("No hay ventas para exportar");
    try {
      const headers = ["Numero_Factura", "Fecha", "Cliente", "Metodo_Pago", "Items_Cantidad", "Total_COP"];
      const rows = filteredSales.map((s) => [
        `"${s.number || ""}"`,
        `"${s.created_at ? new Date(s.created_at).toISOString() : ""}"`,
        `"${(s.customer_name || "Consumidor Final").replace(/"/g, '""')}"`,
        `"${s.payment_method || ""}"`,
        Array.isArray(s?.items) ? s.items.length : 0,
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

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="reports-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Reportes de ventas</h1>
          <p className="text-sm text-slate-500">Historial y métricas de facturas POS registradas.</p>
        </div>
        <Button onClick={exportCSV} variant="outline" className="shrink-0" data-testid="export-csv-btn">
          <Download className="w-4 h-4 mr-2" /> Exportar CSV / Excel
        </Button>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Total Recaudado</div>
              <div className="text-xl font-bold text-emerald-700 font-mono">{formatCOP(stats.totalAmount)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 grid place-items-center">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Facturas Registradas</div>
              <div className="text-xl font-bold text-slate-800 font-mono">{stats.count}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 grid place-items-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Ticket Promedio</div>
              <div className="text-xl font-bold text-purple-700 font-mono">{formatCOP(stats.avgTicket)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardContent className="p-4 space-y-3">
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

