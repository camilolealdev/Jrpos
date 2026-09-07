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
  ShoppingCart,
  Box,
  TrendingUp,
  Printer,
  Barcode,
  Laptop,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/format";
import shotPos from "@/assets/screenshots/pos.jpg";
import shotFacturas from "@/assets/screenshots/facturas.jpg";
import shotInventario from "@/assets/screenshots/inventario.jpg";
import shotCreditos from "@/assets/screenshots/creditos.jpg";
import shotDashboard from "@/assets/screenshots/dashboard.jpg";
import heroBanner from "@/assets/hero-banner.webp";
import logoWhite from "@/assets/logo2.webp";

const KEY_PILLARS = [
  {
    icon: ShoppingCart,
    title: "Ventas más rápidas",
    desc: "Cobro ágil con lector de barras o cámara, pagos combinados y ticket térmico instantáneo.",
    badge: "Alta Velocidad",
    color: "from-emerald-500/20 to-teal-500/10",
    border: "border-emerald-500/30",
    iconColor: "text-emerald-400",
  },
  {
    icon: Box,
    title: "Inventario en tiempo real",
    desc: "Control de stock, alertas de agotado y soporte dual por unidad y sixpack/empaque.",
    badge: "Cero Descuadres",
    color: "from-teal-500/20 to-cyan-500/10",
    border: "border-teal-500/30",
    iconColor: "text-teal-300",
  },
  {
    icon: TrendingUp,
    title: "Tu negocio en crecimiento",
    desc: "Ganancias diarias, arqueo Z sin descuadres y control de fiados con cobro por WhatsApp.",
    badge: "Control Total",
    color: "from-amber-500/20 to-emerald-500/10",
    border: "border-amber-500/30",
    iconColor: "text-amber-400",
  },
];

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
  "Ahorra horas de digitación: la IA lee tus facturas de proveedor en segundos",
  "Define el mínimo por producto y JRPOS avisa antes de que se agote",
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
      {/* Ambient background watermark + glow blobs + fine grid + noise */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Subtle hero banner watermark in ambient background */}
        <div 
          className="absolute -top-10 right-0 w-full lg:w-3/4 h-[750px] opacity-[0.07] bg-cover bg-no-repeat bg-right-top mix-blend-luminosity filter blur-[1px]"
          style={{ backgroundImage: `url(${heroBanner})` }}
        />
        <div className="absolute -top-40 -left-32 w-[36rem] h-[36rem] bg-emerald-600/20 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-[32rem] h-[32rem] bg-teal-500/15 rounded-full blur-[140px]" />
        <div className="absolute -bottom-48 left-1/4 w-[34rem] h-[34rem] bg-amber-500/[0.07] rounded-full blur-[140px]" />
        
        {/* Grid pattern */}
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
          className="flex items-center"
        >
          <img src={logoWhite} alt="JRPOS" className="h-10 sm:h-12 w-auto object-contain drop-shadow-md" />
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

      {/* Hero Section: Value Proposition + Hero Hardware Showcase */}
      <section className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 pt-4 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left Hero Section (42% / 5 cols) */}
          <div className="lg:col-span-5 space-y-6 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-semibold font-['JetBrains_Mono'] uppercase tracking-wide shadow-[3px_3px_10px_rgba(0,0,0,0.35)]"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tecnología POS para Tiendas, Bares y Restaurantes</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-3xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight text-white leading-[1.05] font-['Outfit']"
            >
              JRPOS — El POS que hace{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
                crecer tu tienda
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed"
            >
              Ventas, inventario y control de tu negocio en un solo lugar. De 2 horas cuadrando caja a 90 segundos de ver todo claro.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5"
            >
              <Button
                size="lg"
                onClick={onProceedToLogin}
                className="w-full sm:w-auto h-13 px-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-base rounded-full shadow-[6px_6px_18px_rgba(0,0,0,0.45),-2px_-2px_10px_rgba(85,184,102,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all group"
              >
                <span>Comenzar ahora</span>
                <ArrowRight className="w-5 h-5 ml-1.5 group-hover:translate-x-1 transition-transform" />
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
                  className="w-full sm:w-auto h-13 px-7 bg-white/[0.04] backdrop-blur-md border border-white/15 text-slate-200 font-semibold text-base rounded-full shadow-[4px_4px_12px_rgba(0,0,0,0.35)] hover:bg-white/[0.08] hover:border-emerald-400/30 hover:text-white transition-all"
                >
                  Solicitar Demo
                </Button>
              </a>
            </motion.div>

            {/* Micro feature pills */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            >
              {KEY_PILLARS.map((pillar, idx) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={idx}
                    className="flex flex-col items-center sm:items-start p-3 rounded-2xl bg-white/[0.025] border border-white/[0.06] backdrop-blur-md text-left shadow-[2px_2px_8px_rgba(0,0,0,0.25)]"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${pillar.iconColor}`} />
                      <span className="text-xs font-bold text-white font-['Outfit']">{pillar.title}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                      {pillar.desc}
                    </span>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* Right Hero Section (58% / 7 cols) - Photorealistic Retail Ecosystem Showcase */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-7 relative group"
          >
            {/* Ambient backlight glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-transparent rounded-3xl blur-2xl opacity-60 group-hover:opacity-90 transition-opacity duration-500" />
            
            <div className="relative rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/15 p-2 shadow-[16px_16px_40px_rgba(0,0,0,0.6),-8px_-8px_24px_rgba(255,255,255,0.02)] overflow-hidden">
              <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950">
                <img
                  src={heroBanner}
                  alt="JRPOS Sistema para Tiendas"
                  className="w-full h-full object-cover object-center group-hover:scale-[1.015] transition-transform duration-700 ease-out"
                />
                
                {/* Floating hardware & feature badges */}
                <div className="absolute top-4 left-4 flex flex-wrap gap-2 pointer-events-none">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white shadow-lg">
                    <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                    <span>POS Táctil & PC</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white shadow-lg">
                    <Barcode className="w-3.5 h-3.5 text-teal-300" />
                    <span>Pistola & Cámara</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white shadow-lg">
                    <Printer className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ticket Térmico</span>
                  </div>
                </div>

                <div className="absolute bottom-4 right-4 pointer-events-none">
                  <div className="px-3 py-1.5 rounded-xl bg-emerald-950/80 backdrop-blur-md border border-emerald-500/40 text-[11px] font-semibold text-emerald-200 shadow-xl flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Multi-empaque: Unidad & Sixpack</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* Interactive Module Tour Section */}
      <section className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 py-12 border-t border-white/[0.06]">
        <div className="flex flex-col xl:flex-row items-center gap-14 xl:gap-10">
          
          {/* Left: Value proposition details & Before/After */}
          <div className="flex-1 w-full text-center xl:text-left space-y-6 xl:max-w-xl">
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 font-['JetBrains_Mono']">
                Control Total de Operaciones
              </span>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white font-['Outfit']">
                Cada área de tu negocio, bajo control
              </h2>
              <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
                Diseñado para simplificar el día a día del tendero y administrador en Colombia.
              </p>
            </div>

            {/* Feature checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
              {highlights.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-xs sm:text-sm text-slate-300 rounded-xl bg-white/[0.02] border border-white/[0.05] px-3 py-2.5 shadow-[2px_2px_6px_rgba(0,0,0,0.25)]"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {/* Before vs After Card */}
            <div className="rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/10 shadow-[8px_8px_20px_rgba(0,0,0,0.4),-4px_-4px_16px_rgba(255,255,255,0.02)] p-5">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">
                Tu tienda tradicional vs con JRPOS
              </div>
              <div className="space-y-2.5">
                {BEFORE_AFTER.map(([before, after], idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                    <span className="text-slate-500 line-through decoration-slate-600">{before}</span>
                    <span className="text-emerald-300 font-medium">{after}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Live Interactive Screenshots Browser */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
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

            {/* Active screen caption */}
            <div className="mt-4 flex items-start gap-3 px-1">
              <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 ${screen.accent}`} />
              <div>
                <div className="text-sm font-semibold text-white">{screen.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{screen.desc}</div>
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              <span className="font-semibold text-slate-400">+23 módulos más:</span> Facturación · Caja y Arqueo ·
              Comisiones · Promociones · Compras · Roles de usuario · Exportación Contable
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/[0.06] text-xs text-slate-600">
        <div className="flex items-center gap-2.5">
          <img src={logoWhite} alt="Logo" className="h-7 w-auto object-contain opacity-90" />
          <span>·</span>
          <span>Desarrollado para comercios en Colombia</span>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <a
            href={whatsappUrl(DEMO_WHATSAPP, "Hola, necesito ayuda con el sistema 🏪")}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 px-3 py-1.5 shadow-[2px_2px_6px_rgba(0,0,0,0.3)] hover:bg-white/[0.06] hover:text-emerald-300 transition-colors"
          >
            Contacto y Soporte
          </a>
        </div>
      </footer>
    </div>
  );
}

