import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Reports() {
  const [sales, setSales] = useState([]);
  useEffect(() => { api.get("/sales").then((r) => setSales(r.data)); }, []);

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
                </tr>
              </thead>
              <tbody>
                {sales.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-500">Aún no hay ventas.</td></tr>
                ) : sales.map((s) => (
                  <tr key={s.id} className="border-b hover:bg-slate-50">
                    <td className="p-3 font-mono">{s.number}</td>
                    <td className="p-3">{formatDate(s.created_at)}</td>
                    <td className="p-3">{s.items.length}</td>
                    <td className="p-3"><Badge variant="outline" className="capitalize">{s.payment_method}</Badge></td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCOP(s.total)}</td>
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
