import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Sliders,
  LifeBuoy,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
  Smartphone,
  FileText,
  Boxes,
  Lock,
  Headphones,
  Check,
  X,
  Sparkles,
  Layers,
  CreditCard,
} from "lucide-react";
import { whatsappUrl } from "@/lib/format";

const AVAILABLE_MODULES = [
  {
    key: "ia_ocr",
    name: "IA OCR Facturas",
    desc: "Escaneo inteligente de facturas de compra de proveedores con IA.",
    icon: Sparkles,
    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  },
  {
    key: "whatsapp",
    name: "Cobro por WhatsApp",
    desc: "Recordatorios de cobro de fiados y alertas automáticas por WhatsApp.",
    icon: Smartphone,
    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  },
  {
    key: "electronic_invoicing",
    name: "Facturación Electrónica DIAN",
    desc: "Emisión y validación previa de documentos electrónicos con la DIAN.",
    icon: FileText,
    color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  },
  {
    key: "multi_cashier",
    name: "Multi-Caja y Turnos",
    desc: "Gestión de múltiples cajeros, turnos de caja y arqueos Cierre Z.",
    icon: Users,
    color: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  {
    key: "accounting_export",
    name: "Exportación Contable",
    desc: "Reportes fiscales, libros auxiliares y exportación a Excel / CSV.",
    icon: Boxes,
    color: "text-teal-400 bg-teal-500/10 border-teal-500/20",
  },
  {
    key: "warranties",
    name: "Garantías y Devoluciones",
    desc: "Módulo de seguimiento a garantías técnicas y notas crédito.",
    icon: ShieldCheck,
    color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  },
  {
    key: "promotions",
    name: "Promociones y Descuentos",
    desc: "Reglas de 2x1, descuentos por volumen y combos automáticos.",
    icon: Zap,
    color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  },
  {
    key: "payroll",
    name: "Nómina y Comisiones",
    desc: "Cálculo de comisiones por cajero y registro de turnos laborales.",
    icon: DollarSign,
    color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  },
];

export default function SuperAdmin() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "tenants";
  const [tab, setTabState] = useState(initialTab);

  useEffect(() => {
    const q = searchParams.get("tab");
    if (q && ["tenants", "tickets", "assisted"].includes(q)) {
      setTabState(q);
    }
  }, [searchParams]);

  const setTab = (newTab) => {
    setTabState(newTab);
    setSearchParams({ tab: newTab });
  };

  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [ticketFilter, setTicketFilter] = useState("todos");

  // Modal para configurar módulos de un tenant
  const [selectedTenantForModules, setSelectedTenantForModules] = useState(null);
  const [modulesDraft, setModulesDraft] = useState({});

  // Modal para activar la suscripción pagada de un tenant
  const [selectedTenantForActivation, setSelectedTenantForActivation] = useState(null);
  const [activationDraft, setActivationDraft] = useState({ plan_id: "", months: 1 });

  // Modal para gestionar ticket
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketAdminNotes, setTicketAdminNotes] = useState("");
  const [ticketStatusDraft, setTicketStatusDraft] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes, ticketsRes, plansRes] = await Promise.all([
        api.get("/superadmin/stats"),
        api.get("/superadmin/tenants"),
        api.get("/superadmin/tickets").catch(() => ({ data: [] })),
        api.get("/billing/plans").catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
      setTickets(ticketsRes.data || []);
      setPlans(plansRes.data || []);
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
      await api.post(`/superadmin/tenants/${tenantId}/extend-trial`, { days });
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
      await api.post(`/superadmin/tenants/${tenantId}/status`, { status });
      await loadData();
    } catch (err) {
      alert("Error al cambiar estado del inquilino");
    } finally {
      setActionLoading(false);
    }
  };

  const openModulesModal = (tenant) => {
    setSelectedTenantForModules(tenant);
    setModulesDraft({ ...(tenant.modules_config || {}) });
  };

  const saveModulesConfig = async () => {
    if (!selectedTenantForModules) return;
    setActionLoading(true);
    try {
      await api.put(`/superadmin/tenants/${selectedTenantForModules.id}/modules`, {
        modules_config: modulesDraft,
      });
      setSelectedTenantForModules(null);
      await loadData();
    } catch (err) {
      alert("Error al guardar la configuración de módulos.");
    } finally {
      setActionLoading(false);
    }
  };

  const openActivationModal = (tenant) => {
    setSelectedTenantForActivation(tenant);
    setActivationDraft({ plan_id: plans[0]?.id || "", months: 1 });
  };

  const saveActivation = async () => {
    if (!selectedTenantForActivation || !activationDraft.plan_id) return;
    setActionLoading(true);
    try {
      await api.post(`/billing/superadmin/tenants/${selectedTenantForActivation.id}/activate`, {
        plan_id: activationDraft.plan_id,
        months: Number(activationDraft.months) || 1,
      });
      setSelectedTenantForActivation(null);
      await loadData();
    } catch (err) {
      alert("Error al activar la suscripción.");
    } finally {
      setActionLoading(false);
    }
  };

  const openTicketModal = (ticket) => {
    setSelectedTicket(ticket);
    setTicketAdminNotes(ticket.admin_notes || "");
    setTicketStatusDraft(ticket.status || "abierto");
  };

  const saveTicketUpdate = async () => {
    if (!selectedTicket) return;
    setActionLoading(true);
    try {
      await api.put(`/superadmin/tickets/${selectedTicket.id}`, {
        status: ticketStatusDraft,
        admin_notes: ticketAdminNotes,
      });
      setSelectedTicket(null);
      await loadData();
    } catch (err) {
      alert("Error al actualizar el ticket.");
    } finally {
      setActionLoading(false);
    }
  };

  const impersonateTenant = async (tenantId) => {
    if (!window.confirm("¿Deseas iniciar sesión en modo Soporte Asistido para esta tienda? Podrás auditar su panel exactamente como el cliente.")) {
      return;
    }
    setActionLoading(true);
    try {
      const { data } = await api.post(`/superadmin/impersonate/${tenantId}`, {});
      if (data.ok) {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      alert("Error al iniciar modo soporte asistido");
      setActionLoading(false);
    }
  };

  const filteredTenants = tenants.filter(
    (t) =>
      t.business_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase()) ||
      t.slug?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTickets = tickets.filter((tk) => {
    if (ticketFilter !== "todos" && tk.status !== ticketFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        tk.tenant_name?.toLowerCase().includes(q) ||
        tk.subject?.toLowerCase().includes(q) ||
        tk.user_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

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
            Monitoreo en tiempo real de comercios, suscripciones, activación de módulos y tickets de soporte
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading || actionLoading}
            className="bg-white/5 border-white/10 hover:bg-white/10 text-xs gap-2 text-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Actualizar</span>
          </Button>
        </div>
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
                {stats?.total_sales_count || 0} ventas registradas
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
                Tickets de Soporte
              </p>
              <h3 className="text-2xl font-bold text-white font-['Outfit']">
                {stats?.open_tickets || 0}
              </h3>
              <p className="text-[11px] text-amber-400">Pendientes de atención</p>
            </div>
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <LifeBuoy className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <Button
          variant="ghost"
          onClick={() => setTab("tenants")}
          className={`h-9 text-xs rounded-xl px-4 gap-2 font-medium ${
            tab === "tenants"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Comercios & Suscripciones ({tenants.length})</span>
        </Button>

        <Button
          variant="ghost"
          onClick={() => setTab("tickets")}
          className={`h-9 text-xs rounded-xl px-4 gap-2 font-medium relative ${
            tab === "tickets"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <LifeBuoy className="w-4 h-4" />
          <span>Mesa de Ayuda & Tickets ({tickets.length})</span>
          {stats?.open_tickets > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
        </Button>

        <Button
          variant="ghost"
          onClick={() => setTab("assisted")}
          className={`h-9 text-xs rounded-xl px-4 gap-2 font-medium ${
            tab === "assisted"
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Soporte Asistido (Impersonación)</span>
        </Button>
      </div>

      {/* TAB 1: COMERCIOS & SUSCRIPCIONES */}
      {tab === "tenants" && (
        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-white/5 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
            <CardTitle className="text-base text-white font-semibold flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-400" />
              <span>Directorio de Comercios y Activaciones</span>
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
                  <th className="py-3 px-4">Prueba / Trial</th>
                  <th className="py-3 px-4">Módulos Activos</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTenants.map((t) => {
                  const activeModulesCount = Object.values(t.modules_config || {}).filter(Boolean).length;
                  return (
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openModulesModal(t)}
                          className="h-7 px-2 text-[11px] gap-1.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg"
                        >
                          <Sliders className="w-3 h-3 text-emerald-400" />
                          <span>{activeModulesCount} módulos</span>
                        </Button>
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
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openActivationModal(t)}
                            title="Registrar plan pagado y periodo de suscripción"
                            className="h-7 text-[10px] bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20"
                          >
                            <CreditCard className="w-3 h-3 mr-1" /> Activar Plan
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => impersonateTenant(t.id)}
                            title="Entrar a la tienda como soporte asistido"
                            className="h-7 text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" /> Entrar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
      )}

      {/* TAB 2: MESA DE AYUDA & TICKETS */}
      {tab === "tickets" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/60 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Filtrar por estado:</span>
              {["todos", "abierto", "en_proceso", "resuelto", "cerrado"].map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant="ghost"
                  onClick={() => setTicketFilter(st)}
                  className={`h-7 text-[11px] capitalize rounded-lg px-2.5 ${
                    ticketFilter === st
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {st.replace("_", " ")}
                </Button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar ticket o tienda..."
                className="pl-8 bg-slate-950/60 border-white/10 text-xs h-8 text-white rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTickets.map((tk) => {
              const wa = tk.user_phone ? whatsappUrl(tk.user_phone, `Hola ${tk.user_name}, te escribo del equipo de soporte de JRPOS sobre tu consulta: "${tk.subject}"`) : null;
              return (
                <Card key={tk.id} className="bg-slate-900/60 border-white/10 backdrop-blur-md hover:border-white/20 transition-all">
                  <CardHeader className="pb-3 border-b border-white/5 flex flex-row items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-emerald-400 font-['Outfit']">
                          {tk.tenant_name}
                        </span>
                        <Badge
                          className={`text-[10px] uppercase font-semibold ${
                            tk.priority === "urgente"
                              ? "bg-red-500/20 text-red-300 border-red-500/30"
                              : tk.priority === "alta"
                              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                              : "bg-blue-500/20 text-blue-300 border-blue-500/30"
                          }`}
                        >
                          {tk.priority}
                        </Badge>
                        <Badge
                          className={`text-[10px] capitalize ${
                            tk.status === "abierto"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              : tk.status === "en_proceso"
                              ? "bg-blue-500/10 text-blue-300 border-blue-500/20"
                              : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
                          }`}
                        >
                          {tk.status.replace("_", " ")}
                        </Badge>
                      </div>
                      <CardTitle className="text-sm font-semibold text-white mt-1.5">
                        {tk.subject}
                      </CardTitle>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {tk.created_at ? new Date(tk.created_at).toLocaleDateString("es-CO") : ""}
                    </span>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed bg-black/30 p-2.5 rounded-xl border border-white/5">
                      {tk.message}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <div>
                        <span className="font-semibold text-slate-300">{tk.user_name}</span> ({tk.user_email})
                      </div>
                      {tk.user_phone && (
                        <span className="text-slate-400">Tel: {tk.user_phone}</span>
                      )}
                    </div>

                    {tk.admin_notes && (
                      <div className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 p-2 rounded-lg">
                        <span className="font-semibold">Respuesta / Notas de Soporte:</span> {tk.admin_notes}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      {wa ? (
                        <a href={wa} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-400 hover:text-emerald-300 gap-1.5 px-2">
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Responder por WhatsApp</span>
                          </Button>
                        </a>
                      ) : <div />}

                      <Button
                        size="sm"
                        onClick={() => openTicketModal(tk)}
                        className="h-7 text-xs bg-white/10 hover:bg-white/20 text-white"
                      >
                        Gestionar Ticket
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {filteredTickets.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/30 rounded-2xl border border-white/5">
                <LifeBuoy className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-sm">No hay tickets de soporte en esta categoría.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: AUDITORÍA & ACCESO ASISTIDO */}
      {tab === "assisted" && (
        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md p-6 space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-white font-['Outfit'] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Soporte Asistido e Impersonación Segura</span>
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Como SuperAdmin, puedes entrar a la tienda de cualquier cliente con 1 solo clic para ver su inventario, revisar errores de facturación, o enseñarle a configurar impresoras sin necesidad de solicitarle su contraseña.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tenants.map((t) => (
              <div
                key={t.id}
                className="p-4 rounded-2xl bg-white/[0.025] border border-white/10 flex flex-col justify-between gap-3 hover:border-emerald-500/30 transition-colors"
              >
                <div>
                  <div className="font-semibold text-white text-sm">{t.business_name}</div>
                  <div className="text-[11px] text-slate-400">{t.email}</div>
                  <div className="text-[10px] text-slate-500 mt-1">Slug: {t.slug} • Estado: {t.status}</div>
                </div>

                <Button
                  size="sm"
                  onClick={() => impersonateTenant(t.id)}
                  className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Auditar Tienda</span>
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* MODAL GESTIÓN DE MÓDULOS */}
      {selectedTenantForModules && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white font-['Outfit'] flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-emerald-400" />
                  <span>Activar Módulos para {selectedTenantForModules.business_name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Enciende o apaga módulos según el plan y pago contratado por este comercio.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSelectedTenantForModules(null)}
                className="text-slate-400 hover:text-white rounded-full w-8 h-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
              {AVAILABLE_MODULES.map((mod) => {
                const Icon = mod.icon;
                const isEnabled = Boolean(modulesDraft[mod.key]);
                return (
                  <div
                    key={mod.key}
                    onClick={() => setModulesDraft((prev) => ({ ...prev, [mod.key]: !prev[mod.key] }))}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                      isEnabled
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm"
                        : "bg-white/[0.02] border-white/10 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${mod.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-white font-['Outfit']">{mod.name}</span>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                          isEnabled ? "bg-emerald-500 border-emerald-400 text-slate-950" : "border-white/20"
                        }`}
                      >
                        {isEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">{mod.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                variant="outline"
                onClick={() => setSelectedTenantForModules(null)}
                className="text-xs bg-white/5 border-white/10 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={saveModulesConfig}
                disabled={actionLoading}
                className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5"
              >
                {actionLoading ? "Guardando..." : "Guardar Módulos"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ACTIVAR SUSCRIPCIÓN PAGADA */}
      {selectedTenantForActivation && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-start border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-bold text-white font-['Outfit'] flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-sky-400" />
                  <span>Activar Plan para {selectedTenantForActivation.business_name}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Registra el plan y periodo tras verificar el pago manual (QR/transferencia).
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSelectedTenantForActivation(null)}
                className="text-slate-400 hover:text-white rounded-full w-8 h-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Plan</label>
                <select
                  value={activationDraft.plan_id}
                  onChange={(e) => setActivationDraft((prev) => ({ ...prev, plan_id: e.target.value }))}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-3 h-9 text-xs text-white focus:outline-none focus:border-sky-500/50"
                >
                  {plans.length === 0 && <option value="">Sin planes disponibles</option>}
                  {plans.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900">
                      {p.name} — ${Number(p.price_cop).toLocaleString("es-CO")}/mes
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Meses pagados</label>
                <Input
                  type="number"
                  min={1}
                  value={activationDraft.months}
                  onChange={(e) => setActivationDraft((prev) => ({ ...prev, months: e.target.value }))}
                  className="bg-slate-950/60 border-white/10 text-white h-9 text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                variant="outline"
                onClick={() => setSelectedTenantForActivation(null)}
                className="text-xs bg-white/5 border-white/10 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={saveActivation}
                disabled={actionLoading || !activationDraft.plan_id}
                className="text-xs bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold px-5"
              >
                {actionLoading ? "Activando..." : "Confirmar Activación"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GESTIÓN DE TICKET */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <span className="text-xs text-emerald-400 font-semibold">{selectedTicket.tenant_name}</span>
                <h3 className="text-base font-bold text-white mt-0.5">{selectedTicket.subject}</h3>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSelectedTicket(null)}
                className="text-slate-400 hover:text-white rounded-full w-8 h-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-slate-300 bg-black/30 p-3 rounded-xl border border-white/5">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Mensaje del Comercio:</span>
                {selectedTicket.message}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Estado del Ticket</label>
                <select
                  value={ticketStatusDraft}
                  onChange={(e) => setTicketStatusDraft(e.target.value)}
                  className="w-full h-9 bg-slate-950 border border-white/10 rounded-xl px-3 text-xs text-white"
                >
                  <option value="abierto">Abierto</option>
                  <option value="en_proceso">En Proceso</option>
                  <option value="resuelto">Resuelto</option>
                  <option value="cerrado">Cerrado</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Notas / Respuesta de Soporte</label>
                <textarea
                  value={ticketAdminNotes}
                  onChange={(e) => setTicketAdminNotes(e.target.value)}
                  placeholder="Escribe la solución dada o notas internas del ticket..."
                  rows={3}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <Button
                variant="outline"
                onClick={() => setSelectedTicket(null)}
                className="text-xs bg-white/5 border-white/10 text-slate-300"
              >
                Cancelar
              </Button>
              <Button
                onClick={saveTicketUpdate}
                disabled={actionLoading}
                className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5"
              >
                {actionLoading ? "Guardando..." : "Actualizar Ticket"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
