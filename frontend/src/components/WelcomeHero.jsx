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
import { whatsappUrl } from "@/lib/format";
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
    title: "Cobra en segundos, con pistola o cámara",
    desc: "Escanea con lector físico o cámara, cobra en varias formas de pago con denominaciones rápidas en COP y emite el ticket térmico al instante.",
    img: shotPos,
  },
  {
    id: "ia",
    label: "Escaneo IA",
    path: "/facturas",
    icon: Sparkles,
    accent: "text-orange-300",
    dot: "bg-orange-400",
    title: "OCR con IA, cero digitación manual",
    desc: "Sube la foto de la factura del proveedor: la IA detecta productos, precios y cantidades, y los carga directo a tu inventario.",
    img: shotFacturas,
  },
  {
    id: "inventario",
    label: "Inventario",
    path: "/inventario",
    icon: Boxes,
    accent: "text-teal-300",
    dot: "bg-teal-400",
    title: "Alertas de stock bajo, márgenes siempre claros",
    desc: "Costos, precios y unidades de empaque por producto, con alertas automáticas cuando algo está por agotarse.",
    img: shotInventario,
  },
  {
    id: "creditos",
    label: "Fiados",
    path: "/creditos",
    icon: HandCoins,
    accent: "text-rose-300",
    dot: "bg-rose-400",
    title: "El fiado bajo control, cobrado por WhatsApp",
    desc: "Cartera por cliente, abonos parciales y recordatorio de cobro por WhatsApp con el monto listo, en un toque.",
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
    desc: "Ventas de hoy, productos más vendidos y alertas de bajo stock, de un vistazo — en 90 segundos, no en 2 horas.",
    img: shotDashboard,
  },
];

const highlights = [
  "Vende incluso sin internet: la cola offline sincroniza tus ventas al reconectar",
  "Cierra caja sin sorpresas: Arqueo Cierre Z detecta sobrantes y faltantes",
  "Digitaliza facturas de proveedor con una foto — la IA hace el resto",
  "Alertas automáticas de bajo stock, producto por producto",
  "Cobra el fiado sin perseguir a nadie: recordatorio por WhatsApp en un toque",
  "Roles de Administrador y Cajero: cada quien ve solo lo suyo",
  "Comisiones por vendedor, calculadas y liquidadas solas",
  "Remisiones, notas crédito/débito y cuentas de cobro listas para imprimir",
];

// TODO: reemplazar por el número real de ventas antes de publicar
const DEMO_WHATSAPP = "573000000000";

const BEFORE_AFTER = [
  ["Cuadernos y Excel sueltos", "Un solo panel: ventas, stock y caja"],
  ["Facturas de proveedor a mano", "Foto → productos cargados con IA"],
  ["El fiado se anota y se puede perder", "Cartera por cliente, con historial"],
  ["No sabes qué se agotó hasta que lo piden", "Alerta automática de bajo stock"],
  ["Cierras el día sin saber si ganaste", "Ganancia del día, clara en el panel"],
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
            className="bg-emerald-500/90 backdrop-blur-sm hover:bg-emerald-400 text-emerald-950 font-bold shadow-[4px_4px_12px_rgba(0,0,0,0.4),-2px_-2px_8px_rgba(16,185,129,0.08)] hover:shadow-[5px_5px_14px_rgba(0,0,0,0.45),-2px_-2px_10px_rgba(16,185,129,0.1)] active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.4)] transition-all gap-2 text-sm h-10 px-5 rounded-xl"
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.05] backdrop-blur-md border border-emerald-500/25 text-emerald-300 text-xs font-semibold font-['JetBrains_Mono'] uppercase tracking-wide shadow-[3px_3px_10px_rgba(0,0,0,0.35),-2px_-2px_8px_rgba(255,255,255,0.03)]"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Hecho para tiendas de abarrotes y minimercados en Colombia</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[2.3rem] sm:text-5xl lg:text-[3.6rem] font-extrabold tracking-tight text-white leading-[1.02] font-['Outfit']"
          >
            De 2 horas cuadrando caja a{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
                90 segundos
              </span>
            </span>{" "}
            de ver todo claro.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto xl:mx-0 leading-relaxed"
          >
            JRPOS reemplaza el cuaderno, el Excel y las cuentas a mano por un panel que ves de un vistazo: ventas,
            inventario y fiados, siempre al día.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-left max-w-xl mx-auto xl:mx-0"
          >
            {highlights.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-sm text-slate-300 rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2.5 shadow-[2px_2px_6px_rgba(0,0,0,0.25)]"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-[8px_8px_20px_rgba(0,0,0,0.4),-4px_-4px_16px_rgba(255,255,255,0.02)] p-5 max-w-xl mx-auto xl:mx-0"
          >
            <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
              Así se ve tu tienda antes… y así se ve con JRPOS
            </div>
            <div className="space-y-2">
              {BEFORE_AFTER.map(([before, after], idx) => (
                <div key={idx} className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <span className="text-slate-500 line-through decoration-slate-600">{before}</span>
                  <span className="text-emerald-300 font-medium">{after}</span>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center xl:justify-start gap-3 pt-3"
          >
            <Button
              size="lg"
              onClick={onProceedToLogin}
              className="w-full sm:w-auto h-14 px-8 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-emerald-950 font-bold text-base rounded-2xl shadow-[6px_6px_16px_rgba(0,0,0,0.45),-3px_-3px_12px_rgba(16,185,129,0.08)] hover:shadow-[8px_8px_20px_rgba(0,0,0,0.5),-4px_-4px_14px_rgba(16,185,129,0.1)] active:shadow-[inset_4px_4px_10px_rgba(0,0,0,0.4)] transition-all duration-200 group"
            >
              <span>Entrar al sistema</span>
              <ArrowRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
            </Button>

            <a
              href={whatsappUrl(DEMO_WHATSAPP, "Hola, quiero una demo de JRPOS para mi tienda 🏪")}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto"
            >
              <Button
                size="lg"
                variant="ghost"
                className="w-full sm:w-auto h-14 px-8 bg-white/[0.04] backdrop-blur-md border border-white/15 text-slate-200 font-semibold text-base rounded-2xl shadow-[4px_4px_12px_rgba(0,0,0,0.35),-2px_-2px_8px_rgba(255,255,255,0.03)] hover:bg-white/[0.07] hover:border-emerald-400/30 hover:text-white active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.35)] transition-all"
              >
                Solicitar Demo
              </Button>
            </a>
          </motion.div>

          <div className="flex items-center justify-center xl:justify-start gap-2 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Roles de Administrador y Cajero — tus datos quedan en tu propia base de datos</span>
          </div>
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
          <div className="relative rounded-2xl bg-white/[0.04] backdrop-blur-xl p-px shadow-[10px_10px_28px_rgba(0,0,0,0.55),-6px_-6px_20px_rgba(255,255,255,0.02)]">
            <div className="rounded-[15px] bg-[#0b1611]/80 backdrop-blur-md border border-white/[0.07] overflow-hidden">
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
                  className={`group relative flex flex-col items-center gap-1.5 rounded-xl border backdrop-blur-md px-2 py-2.5 transition-all ${
                    isActive
                      ? "bg-white/[0.07] border-white/20 shadow-[inset_2px_2px_6px_rgba(0,0,0,0.35),inset_-1px_-1px_4px_rgba(255,255,255,0.04)]"
                      : "bg-white/[0.015] border-white/[0.06] shadow-[2px_2px_6px_rgba(0,0,0,0.3),-1px_-1px_4px_rgba(255,255,255,0.02)] hover:bg-white/[0.04] hover:border-white/10"
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

          {/* Active screen caption — always in sync with the url bar and tabs above,
              never lags behind them mid-transition (unlike an exit-animated block would) */}
          <div className="mt-4 flex items-start gap-3 px-1">
            <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 ${screen.accent}`} />
            <div>
              <div className="text-sm font-semibold text-white">{screen.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{screen.desc}</div>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">+23 módulos más:</span> Facturación · Caja y Arqueo ·
            Comisiones · Promociones · Compras · Roles de usuario
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/[0.06] text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <span>© {new Date().getFullYear()} JRPOS System</span>
          <span>·</span>
          <span>Desarrollado para comercios en Colombia</span>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <a
            href={whatsappUrl(DEMO_WHATSAPP, "Hola, necesito ayuda con JRPOS 🏪")}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 px-3 py-1.5 shadow-[2px_2px_6px_rgba(0,0,0,0.3)] hover:bg-white/[0.06] hover:text-emerald-300 transition-colors"
          >
            Contacto y Soporte
          </a>
          <span className="text-emerald-500 font-['JetBrains_Mono']">v1.4</span>
        </div>
      </footer>
    </div>
  );
}
