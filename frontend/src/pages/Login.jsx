import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Store, ArrowLeft, ShieldCheck, Lock, User, KeyRound, Sparkles } from "lucide-react";
import WelcomeHero from "@/components/WelcomeHero";
import logoWhite from "@/assets/logo2.webp";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Si el usuario viene redirigido explícitamente desde una ruta protegida, mostrar directamente el formulario
  const isDirectLogin = Boolean(
    location.state?.from && location.state.from !== "/" && location.state.from !== "/welcome"
  );
  const [view, setView] = useState(isDirectLogin ? "login" : "welcome"); // 'welcome' | 'login'

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Error de autenticación. Verifica tus credenciales.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#07100c] text-slate-100 relative overflow-x-hidden">
      <AnimatePresence mode="wait">
        {view === "welcome" ? (
          <motion.div
            key="welcome-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full"
          >
            <WelcomeHero onProceedToLogin={() => setView("login")} />
          </motion.div>
        ) : (
          <motion.div
            key="login-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="min-h-screen w-full flex flex-col justify-center items-center p-4 relative"
          >
            {/* Background lighting */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/15 rounded-full blur-[128px]" />
              <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-600/15 rounded-full blur-[128px]" />
            </div>

            {/* Back button */}
            <div className="absolute top-6 left-6 z-20">
              <Button
                variant="ghost"
                onClick={() => setView("welcome")}
                className="text-slate-400 hover:text-white bg-white/[0.03] backdrop-blur-md border border-white/10 hover:bg-white/[0.07] gap-2 text-xs shadow-[2px_2px_6px_rgba(0,0,0,0.3)]"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Volver a la Bienvenida</span>
              </Button>
            </div>

            {/* Login Card */}
            <Card className="w-full max-w-md bg-white/[0.04] border-white/10 backdrop-blur-2xl rounded-2xl shadow-[10px_10px_30px_rgba(0,0,0,0.55),-6px_-6px_20px_rgba(255,255,255,0.02)] relative z-10 overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-amber-400 to-orange-500" />
              <CardContent className="p-8 space-y-6">
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-white/[0.06] backdrop-blur-xl border border-white/15 p-2.5 flex items-center justify-center shadow-2xl shadow-emerald-950/60 ring-1 ring-white/20">
                    <img src={logoWhite} alt="JRPOS" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight text-white font-['Outfit']">
                      Iniciar Sesión
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Ingresa tus credenciales para acceder al terminal JRPOS
                    </p>
                  </div>
                </div>

                <form onSubmit={submit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Correo o Usuario</span>
                    </label>
                    <Input
                      type="text"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      placeholder="admin@jrpos.com"
                      className="bg-slate-950/60 border-white/5 shadow-[inset_3px_3px_8px_rgba(0,0,0,0.5),inset_-2px_-2px_6px_rgba(255,255,255,0.02)] focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                      data-testid="login-email"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Contraseña</span>
                    </label>
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="••••••••"
                      className="bg-slate-950/60 border-white/5 shadow-[inset_3px_3px_8px_rgba(0,0,0,0.5),inset_-2px_-2px_6px_rgba(255,255,255,0.02)] focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                      data-testid="login-password"
                    />
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs text-red-400 bg-red-950/50 border border-red-800/60 rounded-lg p-3 text-center"
                      data-testid="login-error"
                    >
                      {error}
                    </motion.div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 bg-emerald-600/90 backdrop-blur-sm hover:bg-emerald-500 text-white font-bold text-sm rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.4),-2px_-2px_8px_rgba(16,185,129,0.06)] hover:shadow-[5px_5px_14px_rgba(0,0,0,0.45)] active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.4)] transition-all"
                    disabled={loading}
                    data-testid="login-submit"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Autenticando...</span>
                      </span>
                    ) : (
                      "Ingresar a mi Tienda"
                    )}
                  </Button>
                </form>

                <div className="pt-2 border-t border-white/10 text-center space-y-2">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    ¿Olvidaste tu contraseña? Solicita el restablecimiento al administrador de la tienda desde el módulo de Usuarios.
                  </p>
                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Conexión cifrada de extremo a extremo</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

