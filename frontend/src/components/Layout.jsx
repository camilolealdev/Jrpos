import { Outlet, NavLink, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Package, Camera, Users, Truck, LineChart,
  FileText, Receipt, ClipboardList, Percent, ShoppingBag, RotateCcw,
  BadgeDollarSign, Wallet, HandCoins, PiggyBank, ShieldCheck, KeyRound,
  BookOpen, Award, FileSignature, Menu, X, Store, Wrench, Boxes, RefreshCw,
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
      { to: "/facturacion-electronica", label: "Facturación Electrónica", icon: FileText, soon: true },
      { to: "/facturacion-pos-electronica", label: "POS Electrónica", icon: Receipt, tid: "nav-pos-electronica", badge: "Sim" },
      { to: "/remisiones", label: "Remisiones", icon: ClipboardList, soon: true },
      { to: "/nomina-electronica", label: "Nómina Electrónica", icon: FileSignature, soon: true },
      { to: "/documento-soporte", label: "Doc. Soporte", icon: FileText, soon: true },
      { to: "/radian", label: "Radian", icon: ShieldCheck, soon: true },
      { to: "/notas", label: "Notas Crédito/Débito", icon: FileText, soon: true },
      { to: "/cuentas-cobro", label: "Cuentas de Cobro", icon: BadgeDollarSign, soon: true },
      { to: "/certificado-digital", label: "Certificado Digital", icon: Award, soon: true },
    ],
  },
  {
    label: "Inventario avanzado",
    items: [
      { to: "/carga-masiva", label: "Carga Masiva", icon: Boxes, tid: "nav-carga-masiva" },
      { to: "/actualizacion-masiva", label: "Actualización Masiva", icon: RefreshCw, tid: "nav-act-masiva" },
      { to: "/promociones", label: "Promociones/Ofertas", icon: Percent, soon: true },
    ],
  },
  {
    label: "Ventas y Compras",
    items: [
      { to: "/ordenes-venta", label: "Órdenes/Cotizaciones", icon: ShoppingBag, soon: true },
      { to: "/garantias", label: "Garantías/Devoluciones", icon: RotateCcw, soon: true },
      { to: "/ordenes-compra", label: "Órdenes de Compra", icon: ShoppingBag, soon: true },
      { to: "/creditos", label: "Créditos (Fiado)", icon: HandCoins, tid: "nav-creditos", badge: "Nuevo" },
      { to: "/servicios", label: "Servicios", icon: Wrench, soon: true },
      { to: "/recogidas", label: "Recogidas Caja", icon: PiggyBank, soon: true },
      { to: "/comisiones", label: "Comisiones", icon: BadgeDollarSign, soon: true },
      { to: "/gastos", label: "Gastos/Pagos", icon: Wallet, tid: "nav-gastos" },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/usuarios", label: "Permisos Usuarios", icon: KeyRound, soon: true },
      { to: "/soporte", label: "Soporte", icon: BookOpen, soon: true },
    ],
  },
];

function SidebarContent({ onNavigate }) {
  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-5 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-emerald-700 text-white grid place-items-center shadow-sm">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight">JRPOS</div>
            <div className="text-[11px] text-slate-500 uppercase tracking-widest">Tienda Colombia</div>
          </div>
        </div>
      </div>
      <nav className="p-3 space-y-5 pb-16">
        {groups.map((g) => (
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
  const loc = useLocation();
  const pageTitle = loc.pathname.replace("/", "") || "dashboard";

  return (
    <div className="min-h-screen bg-background grain-bg flex text-slate-800">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 h-screen">
        <SidebarContent />
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
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
          <div className="flex-1 bg-slate-900/40" onClick={() => setOpen(false)} />
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-40 backdrop-blur-md bg-white/80 border-b border-slate-200/80">
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
              <span className="font-bold">JRPOS</span>
            </div>
            <div className="hidden lg:block">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Módulo</div>
              <div className="text-sm font-semibold capitalize">{pageTitle.replace(/-/g, " ")}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline text-xs text-slate-500">🇨🇴 COP · IVA 19%</span>
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
