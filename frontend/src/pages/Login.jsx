import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Store } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      const d = err?.response?.data?.detail;
      setError(typeof d === "string" ? d : "Error de autenticación");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background grain-bg p-4" data-testid="login-page">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="p-8 space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 mx-auto rounded-xl bg-emerald-700 text-white grid place-items-center shadow">
              <Store className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-extrabold mt-3 tracking-tight">JRPOS</h1>
            <p className="text-sm text-slate-500">Ingresa a tu tienda</p>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs font-semibold">Correo</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus data-testid="login-email" />
            </div>
            <div>
              <label className="text-xs font-semibold">Contraseña</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="login-password" />
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2" data-testid="login-error">{error}</div>}
            <Button type="submit" className="w-full h-11 bg-emerald-700 hover:bg-emerald-800 font-bold" disabled={loading} data-testid="login-submit">
              {loading ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
