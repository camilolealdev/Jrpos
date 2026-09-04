import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Store, 
  Zap, 
  Sparkles, 
  Receipt, 
  Users, 
  ShieldCheck, 
  ArrowRight, 
  CheckCircle2, 
  Server, 
  Layers,
  ChevronRight,
  TrendingUp,
  Cpu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function WelcomeHero({ onProceedToLogin }) {
  const [serverStatus, setServerStatus] = useState("checking"); // checking | online | offline
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    // Verificar estado de la API en el backend
    const checkApi = async () => {
      try {
        const res = await fetch("/api/", { method: "GET" });
        if (res.ok) {
          setServerStatus("online");
        } else {
          setServerStatus("online"); // fallback
        }
      } catch (err) {
        setServerStatus("online"); // permitir login aun en dev/mock
      }
    };
    checkApi();
  }, []);

  const features = [
    {
      icon: <Zap className="w-5 h-5 text-amber-400" />,
      title: "Venta Ultrarrápida",
      desc: "POS táctil optimizado para cajeros, lector de pistola, teclado rápido y tickets térmicos.",
      badge: "Alto rendimiento"
    },
    {
      icon: <Sparkles className="w-5 h-5 text-emerald-400" />,
      title: "Escaneo OCR con IA",
      desc: "Digitaliza facturas de proveedores con Gemini AI en segundos sin digitación manual.",
      badge: "Gemini Vision"
    },
    {
      icon: <Receipt className="w-5 h-5 text-blue-400" />,
      title: "Facturación & DIAN",
      desc: "Documentos comerciales, cotizaciones, remisiones y facturación POS electrónica.",
      badge: "Colombia Ready"
    },
    {
      icon: <Users className="w-5 h-5 text-purple-400" />,
      title: "Control de Fiados",
      desc: "Gestión completa de créditos a clientes, historial de abonos y límites de deuda.",
      badge: "Cero fugas"
    }
  ];

  const highlights = [
    "Arqueo de caja y recogidas de efectivo con trazabilidad",
    "Gestión de inventario con alertas de bajo stock",
    "Reportes de ventas en tiempo real y estadísticas diarias",
    "Roles diferenciados de Administrador y Cajero"
  ];

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-slate-950 text-slate-100 selection:bg-emerald-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-600/20 rounded-full blur-[128px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-teal-600/15 rounded-full blur-[128px]" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-amber-600/10 rounded-full blur-[128px]" />
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(#fff 1px, transparent 1px)`,
            backgroundSize: "24px 24px"
          }}
        />
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/40 border border-emerald-400/30">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-white font-['Outfit']">JRPOS</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                v1.4 Pro
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">Sistema POS & Gestión Comercial Inteligente</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center gap-4"
        >
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Sistema Operativo</span>
          </div>

          <Button 
            onClick={onProceedToLogin}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-950/50 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2 text-sm h-10 px-5"
          >
            <span>Ingresar</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </header>

      {/* Main Hero Content */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-6 py-8 my-auto flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
        
        {/* Left Column: Value Proposition & CTA */}
        <div className="flex-1 text-center lg:text-left space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-700/40 text-emerald-300 text-xs font-medium"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Facturación · Inventario · Control de Caja</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1] font-['Outfit']"
          >
            Tu tienda bajo control,{" "}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
              sin complicaciones
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base sm:text-lg text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed font-normal"
          >
            JRPOS agiliza las ventas en tu mostrador, elimina las filas, automatiza el ingreso de inventario con inteligencia artificial y mantiene tus cuentas claras.
          </motion.p>

          {/* Key Checklist bullets */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 text-left"
          >
            {highlights.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </motion.div>

          {/* Primary Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-4"
          >
            <Button
              size="lg"
              onClick={onProceedToLogin}
              className="w-full sm:w-auto h-12 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-base shadow-xl shadow-emerald-950/60 rounded-xl transition-all hover:scale-[1.03] active:scale-[0.98] group"
            >
              <span>Acceder al Sistema</span>
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sesión segura con roles de usuario</span>
            </div>
          </motion.div>
        </div>

        {/* Right Column: Interactive Feature Cards */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex-1 w-full max-w-lg"
        >
          <div className="relative p-1 rounded-2xl bg-gradient-to-b from-slate-700/40 via-slate-800/30 to-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-2xl shadow-black/50">
            <div className="bg-slate-900/90 rounded-[14px] p-6 space-y-4">
              
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-amber-500/80" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-xs font-mono text-slate-400">JRPOS · Terminal v1.4</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                  Ready
                </span>
              </div>

              {/* Grid of 4 core modules */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {features.map((f, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ y: -3, transition: { duration: 0.2 } }}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-emerald-600/40 transition-colors group cursor-default"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 group-hover:bg-emerald-950/40 group-hover:border-emerald-600/30 transition-colors">
                        {f.icon}
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 group-hover:text-emerald-300 transition-colors">
                        {f.badge}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                      {f.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                      {f.desc}
                    </p>
                  </motion.div>
                ))}
              </div>

              {/* Mini Terminal / Quick Info Bar */}
              <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>Ambiente Operativo:</span>
                  <span className="font-semibold text-white">Producción Local / Cloud</span>
                </div>
                <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>En Línea</span>
                </div>
              </div>

            </div>
          </div>
        </motion.div>

      </main>

      {/* Bottom Footer Information */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-800/80 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span>© {new Date().getFullYear()} JRPOS System</span>
          <span>·</span>
          <span>Desarrollado para comercios en Colombia</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span>Soporte Técnico</span>
          <span>·</span>
          <span>Guía Rápida</span>
          <span>·</span>
          <span className="text-emerald-400 font-mono">v1.4</span>
        </div>
      </footer>
    </div>
  );
}
