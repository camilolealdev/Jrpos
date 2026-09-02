import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { printThermal } from "@/lib/thermalPrint";

export default function Reports() {
  const [sales, setSales] = useState([]);
  useEffect(() => { api.get("/sales").then((r) => setSales(r.data)); }, []);

  const reprint = async (s) => {
    try {
      await printThermal({
        title: "JRPOS",
        subtitle: "REIMPRESIÓN",
        meta: [
          `Factura: ${s.number}`,
          new Date(s.created_at).toLocaleString("es-CO"),
          `Pago: ${s.payment_method}`,
        ],
        items: s.items.map((it) => ({ name: it.name, qty: it.qty, price: formatCOP(it.price), total: formatCOP(it.subtotal) })),
        totals: [["TOTAL", formatCOP(s.total)]],
        footer: "¡Gracias por su compra!",
      });
      toast.success("Enviado a la impresora");
    } catch (e) { toast.error(e.message || "Error de impresión"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="reports-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Reportes de ventas</h1>
        <p className="text-sm text-slate-500">Historial de facturas POS registradas.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Últimas ventas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-left">
                  <th className="p-3">N°</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Ítems</th>
                  <th className="p-3">Método</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-slate-500">Aún no hay ventas.</td></tr>
                ) : sales.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-slate-50" data-testid={`sale-row-${s.id}`}>
                    <td className="p-3 font-mono">{s.number}</td>
                    <td className="p-3">{formatDate(s.created_at)}</td>
                    <td className="p-3">{s.items.length}</td>
                    <td className="p-3"><Badge variant="outline" className="capitalize">{s.payment_method}</Badge></td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCOP(s.total)}</td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => reprint(s)} data-testid={`reprint-${s.id}`}>
                        <Printer className="w-4 h-4 mr-1" /> Reimprimir
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
