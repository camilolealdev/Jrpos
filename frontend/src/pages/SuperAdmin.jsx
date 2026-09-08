import { useState, useEffect } from "react";
import axios from "axios";
import { API } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Store,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  ShieldAlert,
  Search,
  PlusCircle,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";

export default function SuperAdmin() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        axios.get(`${API}/superadmin/stats`, { withCredentials: true }),
        axios.get(`${API}/superadmin/tenants`, { withCredentials: true }),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (err) {
      console.error("Error loading superadmin data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const extendTrial = async (tenantId, days = 15) => {
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/superadmin/tenants/${tenantId}/extend-trial`,
        { days },
        { withCredentials: true }
      );
      await loadData();
    } catch (err) {
      alert("Error al extender período de prueba");
    } finally {
      setActionLoading(false);
    }
  };

  const updateStatus = async (tenantId, status) => {
    setActionLoading(true);
    try {
      await axios.post(
        `${API}/superadmin/tenants/${tenantId}/status`,
        { status },
        { withCredentials: true }
      );
      await loadData();
    } catch (err) {
      alert("Error al cambiar estado del inquilino");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.business_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-100 font-['Outfit']">
              SuperAdmin de Plataforma SaaS
            </h1>
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
              Control Global
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monitoreo en tiempo real de comercios, suscripciones, MRR y soporte multi-tenant
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadData}
          disabled={loading || actionLoading}
          className="bg-white/5 border-white/10 hover:bg-white/10 text-xs gap-2 text-slate-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Actualizar Métricas</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Comercios
              </p>
              <h3 className="text-2xl font-bold text-white font-['Outfit']">
                {stats?.total_tenants || 0}
              </h3>
              <p className="text-[11px] text-emerald-400">
                {stats?.active_tenants || 0} activos • {stats?.trial_tenants || 0} en trial
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Store className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                MRR Estimado
              </p>
              <h3 className="text-2xl font-bold text-white font-['Outfit']">
                ${(stats?.estimated_mrr_cop || 0).toLocaleString("es-CO")}
              </h3>
              <p className="text-[11px] text-slate-400">Ingreso recurrente COP</p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Volumen Procesado
              </p>
              <h3 className="text-2xl font-bold text-white font-['Outfit']">
                ${(stats?.total_sales_volume_cop || 0).toLocaleString("es-CO")}
              </h3>
              <p className="text-[11px] text-emerald-400">
                {stats?.total_sales_count || 0} transacciones POS
              </p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Usuarios Registrados
              </p>
              <h3 className="text-2xl font-bold text-white font-['Outfit']">
                {stats?.total_users || 0}
              </h3>
              <p className="text-[11px] text-slate-400">Dueños y cajeros</p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenants Table */}
      <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
        <CardHeader className="pb-3 border-b border-white/5 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <CardTitle className="text-base text-white font-semibold flex items-center gap-2">
            <Store className="w-4 h-4 text-emerald-400" />
            <span>Directorio de Tiendas e Inquilinos</span>
          </CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por tienda o correo..."
              className="pl-8 bg-slate-950/60 border-white/10 text-xs h-8 text-white rounded-lg"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-white/[0.02] border-b border-white/5 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              <tr>
                <th className="py-3 px-4">Comercio</th>
                <th className="py-3 px-4">Contacto</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Prueba / Suscripción</th>
                <th className="py-3 px-4">Ventas Acumuladas</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredTenants.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{t.business_name}</div>
                    <div className="text-[10px] text-slate-500">{t.slug} • {t.business_type}</div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-200">{t.email}</div>
                    <div className="text-[10px] text-slate-500">{t.phone || "Sin teléfono"}</div>
                  </td>
                  <td className="py-3 px-4">
                    {t.status === "trial" && (
                      <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">
                        Trial ({t.days_left}d)
                      </Badge>
                    )}
                    {t.status === "active" && (
                      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">
                        Activo
                      </Badge>
                    )}
                    {t.status === "suspended" && (
                      <Badge className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px]">
                        Suspendido
                      </Badge>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-slate-300">
                      {t.trial_ends_at ? new Date(t.trial_ends_at).toLocaleDateString("es-CO") : "Indefinido"}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-emerald-400">
                      ${(t.sales_volume_cop || 0).toLocaleString("es-CO")}
                    </div>
                    <div className="text-[10px] text-slate-500">{t.sales_count} ventas</div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => extendTrial(t.id, 15)}
                        className="h-7 text-[10px] bg-white/5 border-white/10 hover:bg-white/10 text-amber-300"
                      >
                        +15d Trial
                      </Button>
                      {t.status !== "active" ? (
                        <Button
                          size="sm"
                          onClick={() => updateStatus(t.id, "active")}
                          className="h-7 text-[10px] bg-emerald-600/80 hover:bg-emerald-500 text-white"
                        >
                          Activar
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateStatus(t.id, "suspended")}
                          className="h-7 text-[10px] bg-red-600/60 hover:bg-red-500 text-white"
                        >
                          Suspender
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No se encontraron tiendas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
