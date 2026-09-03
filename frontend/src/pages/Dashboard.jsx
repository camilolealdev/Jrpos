import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Package, ShoppingCart, TrendingUp, AlertTriangle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/reports/summary");
      setData(data);
    } catch (e) {
      toast.error("Error cargando panel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    try {
      const { data } = await api.post("/seed");
      if (data.seeded) toast.success(`Se cargaron ${data.products} productos y ${data.contacts} contactos`);
      else toast.info(data.message || "Ya hay datos");
      load();
    } catch { toast.error("No se pudo cargar demo"); }
  };

  const stats = [
    { label: "Ventas hoy", value: formatCOP(data?.todays_sales || 0), icon: TrendingUp, color: "text-emerald-700 bg-emerald-50", tid: "stat-todays-sales" },
    { label: "Facturas hoy", value: data?.todays_count ?? 0, icon: ShoppingCart, color: "text-blue-700 bg-blue-50", tid: "stat-todays-count" },
    { label: "Productos", value: data?.products_count ?? 0, icon: Package, color: "text-amber-700 bg-amber-50", tid: "stat-products" },
    { label: "Bajo stock", value: data?.low_stock_count ?? 0, icon: AlertTriangle, color: "text-orange-700 bg-orange-50", tid: "stat-low-stock" },
  ];

  return (
    <div className="p-4 lg:p-8 space-y-6" data-testid="dashboard-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Buen día 👋</h1>
          <p className="text-sm text-slate-500 mt-1">Resumen de tu tienda hoy · {new Date().toLocaleDateString("es-CO", { dateStyle: "full" })}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={seed} data-testid="seed-btn">
            <Sparkles className="w-4 h-4 mr-1" /> Cargar productos demo
          </Button>
          <Link to="/pos">
            <Button className="bg-emerald-700 hover:bg-emerald-800 text-white" data-testid="go-pos-btn">
              Abrir POS <ShoppingCart className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} data-testid={s.tid}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg grid place-items-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{s.label}</div>
                <div className="text-xl sm:text-2xl font-bold mt-0.5 truncate">{s.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-lg">Ventas últimos días</CardTitle></CardHeader>
          <CardContent>
            {data?.daily_sales?.length ? (
              <div className="space-y-2">
                {data.daily_sales.map((d) => {
                  const max = Math.max(...data.daily_sales.map(x => x.total)) || 1;
                  const pct = (d.total / max) * 100;
                  return (
                    <div key={d.date} className="flex items-center gap-3">
                      <div className="w-24 text-xs text-slate-500 font-mono">{d.date}</div>
                      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-28 text-right font-mono text-sm">{formatCOP(d.total)}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-500 py-6 text-center">Aún no hay ventas registradas.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Más vendidos</CardTitle></CardHeader>
          <CardContent>
            {data?.top_products?.length ? (
              <ul className="space-y-2">
                {data.top_products.map((p, i) => (
                  <li key={i} className="flex items-center justify-between text-sm border-b border-slate-100 pb-1.5">
                    <span className="truncate">{i + 1}. {p.name}</span>
                    <span className="font-mono font-semibold text-emerald-700">{p.qty}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-slate-500 py-4">Sin datos aún.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {data?.low_stock?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg text-orange-700">⚠️ Productos con stock bajo</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.low_stock.map((p) => (
                <div key={p.id} className="p-2.5 rounded-md border border-orange-200 bg-orange-50 flex justify-between text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="font-mono font-bold text-orange-700">{p.stock}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
