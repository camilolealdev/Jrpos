import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { API } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Store, ArrowLeft, ShieldCheck, Sparkles, CheckCircle2, Phone, Mail, Lock, User, ShoppingBag } from "lucide-react";
import logoWhite from "@/assets/logo2.webp";
import heroShowcase from "@/assets/hero-showcase.jpg";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import GoogleOnboardingModal from "@/components/GoogleOnboardingModal";
import { useGoogleAuthFlow } from "@/lib/useGoogleAuthFlow";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

export default function RegisterTenant() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const { handleGoogleCredential, error: googleError, onboardingModalProps } = useGoogleAuthFlow({ setUser, navigate });

  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [businessType, setBusinessType] = useState("abarrotes");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { data } = await axios.post(
        `${API}/auth/register-tenant`,
        {
          business_name: businessName,
          name: name || businessName,
          email,
          phone,
          password,
          business_type: businessType,
        },
        { withCredentials: true, timeout: 10000 }
      );

      if (data.user) {
        setUser(data.user);
        navigate("/dashboard");
      }
    } catch (err) {
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Error al registrar la tienda. Verifica los datos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#07100c] text-slate-100 relative overflow-x-hidden flex flex-col justify-center items-center p-4">
      {/* Background with watermark and glows */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07] bg-cover bg-center mix-blend-luminosity filter blur-[2px] scale-105"
          style={{ backgroundImage: `url(${heroShowcase})` }}
        />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-600/20 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-teal-600/15 rounded-full blur-[128px]" />
      </div>

      {/* Top back navigation */}
      <div className="absolute top-6 left-6 z-20">
        <Link to="/login">
          <Button
            variant="ghost"
            className="text-slate-400 hover:text-white bg-white/[0.03] backdrop-blur-md border border-white/10 hover:bg-white/[0.07] gap-2 text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>¿Ya tienes cuenta? Iniciar Sesión</span>
          </Button>
        </Link>
      </div>

      {/* Registration Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className="w-full max-w-lg relative z-10 my-8"
      >
        <Card className="bg-white/[0.04] border-white/10 backdrop-blur-2xl rounded-3xl shadow-[10px_10px_35px_rgba(0,0,0,0.6)] overflow-hidden">
          <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 via-teal-400 to-amber-400" />
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto flex justify-center items-center mb-1">
                <img src={logoWhite} alt="Logo" className="h-14 w-auto object-contain drop-shadow-md" />
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>30 Días de Prueba Gratis • Sin Tarjeta de Crédito</span>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white font-['Outfit']">
                Crea tu Tienda en JRPOS
              </h1>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Controla ventas, inventario, escaneo con celular y cuentas fiadas en menos de 2 minutos.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nombre de tu Negocio o Tienda *</span>
                </label>
                <Input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  placeholder="Ej: Minimercado El Triunfo"
                  className="bg-slate-950/60 border-white/5 focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tu Nombre Completo *</span>
                  </label>
                  <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="Ej: Carlos Gómez"
                    className="bg-slate-950/60 border-white/5 focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Celular / WhatsApp *</span>
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="300 123 4567"
                    className="bg-slate-950/60 border-white/5 focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Correo Electrónico *</span>
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="tu@correo.com"
                    className="bg-slate-950/60 border-white/5 focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Contraseña Segura *</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="bg-slate-950/60 border-white/5 focus:border-emerald-500/50 text-white placeholder:text-slate-600 h-10 rounded-xl"
                  />
                  <PasswordStrengthMeter password={password} email={email} className="pt-1" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tipo de Comercio</span>
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl px-3 h-10 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                >
                  {BUSINESS_TYPES.map((bt) => (
                    <option key={bt.id} value={bt.id} className="bg-slate-900 text-white">{bt.label}</option>
                  ))}
                </select>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-red-400 bg-red-950/50 border border-red-800/60 rounded-xl p-3 text-center"
                >
                  {error}
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm rounded-xl shadow-[4px_4px_15px_rgba(16,185,129,0.3)] transition-all"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Creando tu tienda...</span>
                  </span>
                ) : (
                  "Comenzar mi Prueba Gratis de 30 Días"
                )}
              </Button>
            </form>

            <div className="flex items-center gap-3 text-[10px] text-slate-500 uppercase tracking-wide">
              <div className="h-px flex-1 bg-white/10" />
              <span>o continúa con</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {googleError && (
              <div className="text-xs text-red-400 bg-red-950/50 border border-red-800/60 rounded-xl p-3 text-center">
                {googleError}
              </div>
            )}

            <GoogleSignInButton text="signup_with" onCredential={handleGoogleCredential} />

            <div className="pt-2 border-t border-white/10 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Escaneo con Celular</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Control de Fiados</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Reportes en Tiempo Real</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Soporte Incluido</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-400/80 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Datos 100% aislados y protegidos</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <GoogleOnboardingModal {...onboardingModalProps} />
    </div>
  );
}
