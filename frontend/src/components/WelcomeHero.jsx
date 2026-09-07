import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Store,
  Zap,
  Sparkles,
  HandCoins,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  LayoutDashboard,
  Boxes,
  ChevronRight,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import shotPos from "@/assets/screenshots/pos.jpg";
import shotFacturas from "@/assets/screenshots/facturas.jpg";
import shotInventario from "@/assets/screenshots/inventario.jpg";
import shotCreditos from "@/assets/screenshots/creditos.jpg";
import shotDashboard from "@/assets/screenshots/dashboard.jpg";

const SCREENS = [
  {
    id: "pos",
    label: "Punto de Venta",
    path: "/pos",
    icon: Zap,
    accent: "text-amber-300",
    dot: "bg-amber-400",
    title: "Vende en segundos, no en minutos",
    desc: "Búsqueda instantánea, lector de pistola y cobro en un clic. Diseñado para el ritmo real de un mostrador.",
    img: shotPos,
  },
  {
    id: "ia",
    label: "Escaneo IA",
    path: "/facturas",
    icon: Sparkles,
    accent: "text-violet-300",
    dot: "bg-violet-400",
    title: "Factura del proveedor → inventario, con IA",
    desc: "Sube la foto y Gemini extrae productos, precios y cantidades. Cero digitación manual.",
    img: shotFacturas,
  },
  {
    id: "inventario",
    label: "Inventario",
    path: "/inventario",
    icon: Boxes,
    accent: "text-blue-300",
    dot: "bg-blue-400",
    title: "Costos, precios y stock siempre claros",
    desc: "Alertas de bajo stock automáticas y control de márgenes producto por producto.",
    img: shotInventario,
  },
  {
    id: "creditos",
    label: "Fiados",
    path: "/creditos",
    icon: HandCoins,
    accent: "text-orange-300",
    dot: "bg-orange-400",
    title: "El fiado, bajo control por fin",
    desc: "Cartera por cliente, historial de abonos y recordatorios por WhatsApp con un toque.",
    img: shotCreditos,
  },
  {
    id: "panel",
    label: "Panel General",
    path: "/dashboard",
    icon: LayoutDashboard,
    accent: "text-emerald-300",
    dot: "bg-emerald-400",
    title: "Tu tienda, resumida cada mañana",
    desc: "Ventas de hoy, productos más vendidos y bajo stock, de un vistazo.",
    img: shotDashboard,
  },
];

const highlights = [
  "Arqueo de caja y recogidas de efectivo con trazabilidad",
  "Facturación POS electrónica y documentos comerciales",
  "Reportes de ventas en tiempo real, sin hojas de cálculo",
  "Roles diferenciados de Administrador y Cajero",
];

export default function WelcomeHero({ onProceedToLogin }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((i) => (i + 1) % SCREENS.length), 4800);
    return () => clearInterval(t);
  }, [paused, active]);

  const screen = SCREENS[active];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07100c] text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Ambient background: glow blobs + fine grid + noise */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-32 w-[32rem] h-[32rem] bg-emerald-600/20 rounded-full blur-[140px]" />
        <div className="absolute top-1/4 -right-40 w-[28rem] h-[28rem] bg-teal-500/15 rounded-full blur-[140px]" />
        <div className="absolute -bottom-48 left-1/4 w-[30rem] h-[30rem] bg-amber-500/[0.07] rounded-full blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 90%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* Top Navigation */}
      <header className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 py-6 flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/40 border border-emerald-300/30">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-white font-['Outfit']">JRPOS</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-['JetBrains_Mono']">
                v1.4
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">Sistema POS &amp; Gestión Comercial Inteligente</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center gap-3"
        >
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10 text-xs text-slate-300 font-['JetBrains_Mono']">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span>sistema operativo</span>
          </div>

          <Button
            onClick={onProceedToLogin}
            className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2 text-sm h-10 px-5"
          >
            <span>Ingresar</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </header>

      {/* Hero: pitch + live product monitor */}
      <main className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 pt-6 pb-16 flex flex-col xl:flex-row items-center gap-14 xl:gap-10">
        {/* Left: Value proposition */}
        <div className="flex-1 w-full text-center xl:text-left space-y-7 xl:max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 text-xs font-medium font-['JetBrains_Mono'] uppercase tracking-wide"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Facturación · Inventario · Control de Caja</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[2.6rem] sm:text-6xl lg:text-[4.2rem] font-extrabold tracking-tight text-white leading-[0.98] font-['Outfit']"
          >
            Tu tienda,{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
                bajo control
              </span>
            </span>
            . Sin complicaciones.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto xl:mx-0 leading-relaxed"
          >
            JRPOS agiliza las ventas en tu mostrador, elimina las filas, digitaliza facturas de proveedores con IA y
            mantiene tus cuentas claras — incluido el fiado.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-left max-w-xl mx-auto xl:mx-0"
          >
            {highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center xl:justify-start gap-4 pt-3"
          >
            <Button
              size="lg"
              onClick={onProceedToLogin}
              className="w-full sm:w-auto h-14 px-8 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-emerald-950 font-bold text-base shadow-xl shadow-emerald-950/60 rounded-xl transition-all hover:scale-[1.03] active:scale-[0.98] group"
            >
              <span>Acceder al Sistema</span>
              <ArrowRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
            </Button>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Sesión segura con roles de usuario</span>
            </div>
          </motion.div>
        </div>

        {/* Right: Live product monitor — real screenshots, tab-switchable */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex-1 w-full max-w-2xl"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Browser-chrome frame */}
          <div className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] via-white/[0.03] to-transparent p-px shadow-2xl shadow-black/60">
            <div className="rounded-[15px] bg-[#0b1611] border border-white/[0.07] overflow-hidden">
              {/* chrome bar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/30 text-[11px] text-slate-500 font-['JetBrains_Mono']">
                    <ShieldCheck className="w-3 h-3 text-emerald-500/70" />
                    <span>app.jrpos.co{screen.path}</span>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-1 text-[10px] text-emerald-400/80 font-['JetBrains_Mono']">
                  <Radio className="w-3 h-3" />
                  <span>interfaz real</span>
                </div>
              </div>

              {/* screenshot viewport */}
              <div className="relative w-full aspect-[1440/675] overflow-hidden bg-[#0b1611]">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={screen.id}
                    src={screen.img}
                    alt={`JRPOS — ${screen.label}`}
                    initial={{ opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.99 }}
                    transition={{ duration: 0.45, ease: "easeOut" }}
                    className="absolute top-0 left-0 h-full object-cover object-left-top"
                    style={{ width: "112%", maxWidth: "112%" }}
                  />
                </AnimatePresence>
                {/* subtle scanline sweep */}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] via-transparent to-black/20" />
              </div>
            </div>
          </div>

          {/* Module tabs */}
          <div className="mt-4 grid grid-cols-5 gap-2">
            {SCREENS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === active;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(i)}
                  data-testid={`hero-tab-${s.id}`}
                  className={`group relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 transition-all ${
                    isActive
                      ? "bg-white/[0.06] border-white/20"
                      : "bg-white/[0.015] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/10"
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-colors ${isActive ? s.accent : "text-slate-500 group-hover:text-slate-300"}`} />
                  <span className={`text-[10px] font-medium leading-none text-center transition-colors ${isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"}`}>
                    {s.label}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="hero-tab-underline"
                      className={`absolute -bottom-[9px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${s.dot}`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active screen caption */}
          <AnimatePresence mode="wait">
            <motion.div
              key={screen.id + "-caption"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              className="mt-4 flex items-start gap-3 px-1"
            >
              <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 ${screen.accent}`} />
              <div>
                <div className="text-sm font-semibold text-white">{screen.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{screen.desc}</div>
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-white/[0.06] text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span>© {new Date().getFullYear()} JRPOS System</span>
          <span>·</span>
          <span>Desarrollado para comercios en Colombia</span>
        </div>
        <div className="flex items-center gap-4 text-slate-500">
          <span>Soporte Técnico</span>
          <span>·</span>
          <span>Guía Rápida</span>
          <span>·</span>
          <span className="text-emerald-500 font-['JetBrains_Mono']">v1.4</span>
        </div>
      </footer>
    </div>
  );
}
