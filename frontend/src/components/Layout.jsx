import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { startOnboarding, ONBOARDING_KEY } from "@/lib/onboarding";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { applyAccent } from "@/pages/Settings";
import {
  LayoutDashboard, ShoppingCart, Package, Camera, Users, Truck, LineChart,
  FileText, Receipt, ClipboardList, Percent, ShoppingBag, RotateCcw,
  BadgeDollarSign, Wallet, HandCoins, PiggyBank, ShieldCheck, KeyRound,
  BookOpen, Award, FileSignature, Menu, X, Store, Wrench, Boxes, RefreshCw, HelpCircle, LogOut, Settings2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

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
      { to: "/facturacion-pos-electronica", label: "POS Electrónica", icon: Receipt, tid: "nav-pos-electronica", badge: "Sim", adminOnly: true },
      { to: "/remisiones", label: "Remisiones", icon: ClipboardList, tid: "nav-remisiones", adminOnly: true },
      { to: "/nomina-electronica", label: "Nómina Electrónica", icon: FileSignature, tid: "nav-nomina", badge: "Sim", adminOnly: true },
      { to: "/documento-soporte", label: "Doc. Soporte", icon: FileText, tid: "nav-doc-soporte", badge: "Sim", adminOnly: true },
      { to: "/radian", label: "Radian", icon: ShieldCheck, tid: "nav-radian", badge: "Sim", adminOnly: true },
      { to: "/notas", label: "Notas Crédito/Débito", icon: FileText, tid: "nav-notas", adminOnly: true },
      { to: "/cuentas-cobro", label: "Cuentas de Cobro", icon: BadgeDollarSign, tid: "nav-cuentas", adminOnly: true },
      { to: "/certificado-digital", label: "Certificado Digital", icon: Award, tid: "nav-certificado", badge: "Sim", adminOnly: true },
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
      { to: "/soporte", label: "Soporte", icon: BookOpen, tid: "nav-soporte" },
    ],
  },
];

function SidebarContent({ onNavigate, storeName = "JRPOS", role = "admin" }) {
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.adminOnly || role === "admin") }))
    .filter((g) => g.items.length > 0);
  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-700 text-white grid place-items-center shadow-sm">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight" data-testid="sidebar-store-name">{storeName}</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-widest">Tienda Colombia</div>
          </div>
        </div>
      </div>
      <nav className="p-3 space-y-5 pb-16">
        {visibleGroups.map((g) => (
          <div key={g.label}>
            <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  onClick={onNavigate}
                  data-testid={it.tid}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors group",
                      isActive
                        ? "bg-emerald-50 text-emerald-800 font-semibold"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )
                  }
                >
                  <it.icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                      {it.badge}
                    </span>
                  )}
                  {it.soon && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                      pronto
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </ScrollArea>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const [storeName, setStoreName] = useState("JRPOS");
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const pageTitle = loc.pathname.replace("/", "") || "dashboard";

  // Personalización: nombre de tienda + color de acento
  useEffect(() => {
    const cached = localStorage.getItem("jrpos_accent");
    if (cached) applyAccent(cached);
    api.get("/settings/general").then((r) => {
      setStoreName(r.data.store_name || "JRPOS");
      applyAccent(r.data.accent);
      localStorage.setItem("jrpos_settings", JSON.stringify(r.data));
    }).catch(() => {});
  }, []);

  const doLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Auto-onboarding en la primera visita (solo escritorio: el tour apunta al sidebar)
  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY) && window.innerWidth >= 1024) {
      const t = setTimeout(() => {
        startOnboarding();
        localStorage.setItem(ONBOARDING_KEY, "1");
      }, 800);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background grain-bg flex text-slate-800">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 h-screen z-30">
        <SidebarContent storeName={storeName} role={user?.role} />
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
            <SidebarContent onNavigate={() => setOpen(false)} storeName={storeName} role={user?.role} />
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
              <div className="w-8 h-8 rounded-md bg-emerald-700 text-white grid place-items-center">
                <Store className="w-4 h-4" />
              </div>
              <span className="font-bold" data-testid="mobile-store-name">{storeName}</span>
            </div>
            <div className="hidden lg:block">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Módulo</div>
              <div className="text-sm font-semibold capitalize">{pageTitle.replace(/-/g, " ")}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
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
                onClick={startOnboarding}
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
    </div>
  );
}
