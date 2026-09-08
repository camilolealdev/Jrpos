import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { startOnboarding, ONBOARDING_KEY } from "@/lib/onboarding";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { applyAccent } from "@/pages/Settings";
import { HIDDEN_MODULE_TIDS_BY_TYPE } from "@/lib/businessTypes";
import BusinessTypeModal from "@/components/BusinessTypeModal";
import {
  LayoutDashboard, ShoppingCart, Package, Camera, Users, Truck, LineChart,
  FileText, Receipt, ClipboardList, Percent, ShoppingBag, RotateCcw,
  BadgeDollarSign, Wallet, HandCoins, PiggyBank, ShieldCheck, KeyRound,
  BookOpen, Award, FileSignature, Menu, X, Store, Wrench, Boxes, RefreshCw, HelpCircle, LogOut, Settings2, Clock,
  Wifi, WifiOff, Sparkles,
} from "lucide-react";
import { syncOfflineSales } from "@/lib/offlineSync";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import logoWhite from "@/assets/logo2.webp";
import logoDark from "@/assets/logo.webp";

const groups = [
  {
    label: "Operación",
    items: [
      { to: "/dashboard", label: "Panel", icon: LayoutDashboard, tid: "nav-dashboard" },
      { to: "/pos", label: "POS Venta", icon: ShoppingCart, tid: "nav-pos" },
      { to: "/facturas", label: "Escanear Factura", icon: Camera, tid: "nav-facturas", badge: "IA" },
      { to: "/inventario", label: "Inventario", icon: Package, tid: "nav-inventario" },
      { to: "/reportes", label: "Reportes", icon: LineChart, tid: "nav-reportes" },
      { to: "/marcacion", label: "Marcación", icon: Clock, tid: "nav-marcacion" },
    ],
  },
  {
    label: "Contactos",
    items: [
      { to: "/clientes", label: "Clientes", icon: Users, tid: "nav-clientes" },
      { to: "/proveedores", label: "Proveedores", icon: Truck, tid: "nav-proveedores" },
    ],
  },
  {
    label: "Facturación DIAN",
    items: [
      { to: "/facturacion-electronica", label: "Facturación Electrónica", icon: FileText, tid: "nav-fe", adminOnly: true },
      { to: "/facturacion-pos-electronica", label: "POS Electrónica", icon: Receipt, tid: "nav-pos-electronica", badge: "Demo", adminOnly: true },
      { to: "/remisiones", label: "Remisiones", icon: ClipboardList, tid: "nav-remisiones", adminOnly: true },
      { to: "/nomina-electronica", label: "Nómina Electrónica", icon: FileSignature, tid: "nav-nomina", badge: "Demo", adminOnly: true },
      { to: "/documento-soporte", label: "Doc. Soporte", icon: FileText, tid: "nav-doc-soporte", badge: "Demo", adminOnly: true },
      { to: "/radian", label: "Radian", icon: ShieldCheck, tid: "nav-radian", badge: "Demo", adminOnly: true },
      { to: "/notas", label: "Notas Crédito/Débito", icon: FileText, tid: "nav-notas", adminOnly: true },
      { to: "/cuentas-cobro", label: "Cuentas de Cobro", icon: BadgeDollarSign, tid: "nav-cuentas", adminOnly: true },
      { to: "/certificado-digital", label: "Certificado Digital", icon: Award, tid: "nav-certificado", badge: "Demo", adminOnly: true },
    ],
  },
  {
    label: "Inventario avanzado",
    items: [
      { to: "/carga-masiva", label: "Carga Masiva", icon: Boxes, tid: "nav-carga-masiva", adminOnly: true },
      { to: "/actualizacion-masiva", label: "Actualización Masiva", icon: RefreshCw, tid: "nav-act-masiva", adminOnly: true },
      { to: "/promociones", label: "Promociones/Ofertas", icon: Percent, tid: "nav-promociones", adminOnly: true },
    ],
  },
  {
    label: "Ventas y Compras",
    items: [
      { to: "/ordenes-venta", label: "Órdenes/Cotizaciones", icon: ShoppingBag, tid: "nav-ordenes-venta" },
      { to: "/garantias", label: "Garantías/Devoluciones", icon: RotateCcw, tid: "nav-garantias" },
      { to: "/ordenes-compra", label: "Órdenes de Compra", icon: ShoppingBag, tid: "nav-ordenes-compra" },
      { to: "/creditos", label: "Créditos (Fiado)", icon: HandCoins, tid: "nav-creditos", badge: "Nuevo" },
      { to: "/servicios", label: "Servicios", icon: Wrench, tid: "nav-servicios" },
      { to: "/recogidas", label: "Caja y Recogidas", icon: PiggyBank, tid: "nav-recogidas" },
      { to: "/comisiones", label: "Comisiones", icon: BadgeDollarSign, tid: "nav-comisiones", adminOnly: true },
      { to: "/gastos", label: "Gastos/Pagos", icon: Wallet, tid: "nav-gastos" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/usuarios", label: "Permisos Usuarios", icon: KeyRound, tid: "nav-usuarios", adminOnly: true },
      { to: "/configuracion", label: "Configuración", icon: Settings2, tid: "nav-configuracion", adminOnly: true },
      { to: "/superadmin", label: "SuperAdmin SaaS", icon: ShieldCheck, tid: "nav-superadmin", superadminOnly: true },
      { to: "/soporte", label: "Soporte", icon: BookOpen, tid: "nav-soporte" },
    ],
  },
];

function SidebarContent({ onNavigate, storeName = "Mi Tienda", storeSub = "Punto de Venta", role = "admin", businessType = "abarrotes" }) {
  const hiddenTids = HIDDEN_MODULE_TIDS_BY_TYPE[businessType] || [];
  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.superadminOnly && role !== "superadmin_platform") return false;
        if (it.adminOnly && role !== "admin" && role !== "superadmin_platform") return false;
        return !hiddenTids.includes(it.tid);
      }),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-950 p-1.5 flex items-center justify-center shadow-sm shrink-0 border border-slate-800">
            <img src={logoWhite} alt="JRPOS" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-sm truncate text-slate-900 font-['Outfit']" data-testid="sidebar-store-name">
              {storeName}
            </div>
            <div className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
              <Store className="w-3 h-3 text-emerald-600 inline" /> {storeSub}
            </div>
          </div>
        </div>
      </div>

      <nav className="p-3 space-y-5" data-testid="sidebar-nav">
        {visibleGroups.map((g) => (
          <div key={g.label} className="space-y-1">
            <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {g.label}
            </div>
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  data-testid={it.tid}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                      isActive
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    )
                  }
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate flex-1">{it.label}</span>
                  {it.badge && (
                    <span
                      className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide",
                        it.badge === "IA"
                          ? "bg-amber-400/20 text-amber-700 border border-amber-400/40"
                          : "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
                      )}
                    >
                      {it.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </ScrollArea>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [storeName, setStoreName] = useState("JRPOS");
  const [storeSub, setStoreSub] = useState("Punto de Venta");
  const [businessType, setBusinessType] = useState("abarrotes");
  const [fullSettings, setFullSettings] = useState(null);
  const [showBusinessTypeModal, setShowBusinessTypeModal] = useState(false);
  const [savingBusinessType, setSavingBusinessType] = useState(false);

  const pageTitle = location.pathname.split("/")[1] || "dashboard";

  const applyData = (data) => {
    if (!data) return;
    setFullSettings(data);
    if (data.store_name) setStoreName(data.store_name);
    if (data.store_slogan) setStoreSub(data.store_slogan);
    if (data.business_type) setBusinessType(data.business_type);
    if (data.accent) applyAccent(data.accent);
  };

  useEffect(() => {
    const cached = localStorage.getItem("jrpos_settings");
    if (cached) {
      try {
        applyData(JSON.parse(cached));
      } catch {}
    }

    api.get("/settings/general").then((r) => {
      applyData(r.data);
      localStorage.setItem("jrpos_settings", JSON.stringify(r.data));
      if (user?.role === "admin" && !localStorage.getItem("jrpos_business_type_asked")) {
        setShowBusinessTypeModal(true);
      }
    }).catch(() => {});

    const handleSettingsUpdate = (e) => {
      if (e.detail) applyData(e.detail);
    };
    window.addEventListener("jrpos_settings_updated", handleSettingsUpdate);
    return () => window.removeEventListener("jrpos_settings_updated", handleSettingsUpdate);
  }, [user]);

  const handleBusinessTypeSelect = async (chosen) => {
    setSavingBusinessType(true);
    try {
      const payload = { ...(fullSettings || {}), business_type: chosen };
      const r = await api.put("/settings/general", payload);
      const data = r.data || payload;
      setBusinessType(chosen);
      setFullSettings(data);
      localStorage.setItem("jrpos_settings", JSON.stringify(data));
      localStorage.setItem("jrpos_business_type_asked", "1");
      window.dispatchEvent(new CustomEvent("jrpos_settings_updated", { detail: data }));
    } catch {
      localStorage.setItem("jrpos_business_type_asked", "1");
    } finally {
      setSavingBusinessType(false);
      setShowBusinessTypeModal(false);
    }
  };

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      toast.success("Conexión restablecida. Sincronizando datos...");
      try {
        const count = await syncOfflineSales(api);
        if (count && count > 0) {
          toast.success(`${count} venta(s) offline sincronizada(s) con éxito.`);
        }
      } catch {}
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Modo sin conexión activado. Las ventas se guardarán localmente.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!fullSettings || showBusinessTypeModal) return;
    if (!localStorage.getItem(ONBOARDING_KEY) && window.innerWidth >= 1024) {
      const t = setTimeout(() => {
        startOnboarding(HIDDEN_MODULE_TIDS_BY_TYPE[businessType] || []);
        localStorage.setItem(ONBOARDING_KEY, "1");
      }, 800);
      return () => clearTimeout(t);
    }
  }, [fullSettings, showBusinessTypeModal, businessType]);

  return (
    <div className="min-h-screen bg-background grain-bg flex text-slate-800">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 h-screen z-30">
        <SidebarContent storeName={storeName} storeSub={storeSub} role={user?.role} businessType={businessType} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-72 bg-white h-full shadow-xl" data-testid="mobile-sidebar">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} data-testid="close-sidebar">
                <X className="w-5 h-5" />
              </Button>
            </div>
            <SidebarContent onNavigate={() => setOpen(false)} storeName={storeName} storeSub={storeSub} role={user?.role} businessType={businessType} />
          </div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setOpen(false)} />
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col min-h-screen">
        <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-slate-200/80 shrink-0">
          <div className="flex items-center gap-3 px-4 lg:px-6 h-14">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              data-testid="open-sidebar"
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-2 lg:hidden">
              <div className="w-8 h-8 rounded-lg bg-slate-950 p-1 flex items-center justify-center shadow-sm border border-slate-800">
                <img src={logoWhite} alt="JRPOS" className="w-full h-full object-contain" />
              </div>
              <span className="font-bold text-slate-900" data-testid="mobile-store-name">{storeName}</span>
            </div>
            <div className="hidden lg:block">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Módulo</div>
              <div className="text-sm font-semibold capitalize">{pageTitle.replace(/-/g, " ")}</div>
            </div>

            {/* Trial countdown badge */}
            {user?.tenant?.days_left !== undefined && (
              <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-800">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                <span>Prueba Gratuita: {user.tenant.days_left} días restantes</span>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <div
                className={cn(
                  "hidden xs:flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all",
                  isOnline
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
                )}
                title={isOnline ? "Conectado al servidor" : "Modo sin conexión activo (ventas locales)"}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span className="hidden sm:inline">{isOnline ? "En línea" : "Offline"}</span>
              </div>
              <span className="hidden sm:inline text-xs text-slate-500">🇨🇴 COP · IVA 19%</span>
              {user && (
                <div className="hidden sm:flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 bg-slate-50" data-testid="user-chip">
                  <span className="font-semibold">{user.name}</span>
                  <span className="text-slate-400">·</span>
                  <span className="capitalize text-emerald-700 font-semibold">{user.role}</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => startOnboarding(HIDDEN_MODULE_TIDS_BY_TYPE[businessType] || [])}
                data-testid="start-onboarding-btn"
                title="Ver guía de módulos"
              >
                <HelpCircle className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">Guía</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={doLogout} data-testid="logout-btn" title="Cerrar sesión">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </header>
        <div className="flex-1 min-h-0">
          <Outlet />
        </div>
      </main>

      <BusinessTypeModal
        open={showBusinessTypeModal}
        onSelect={handleBusinessTypeSelect}
        saving={savingBusinessType}
      />
    </div>
  );
}
