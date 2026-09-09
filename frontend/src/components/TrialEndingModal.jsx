import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Copy, Smartphone, Landmark, ExternalLink, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BILLING_PERIODS, periodPrice, periodSavingsPct, copyToClipboard } from "@/lib/billing";

const API = "/api";

export default function TrialEndingModal({ open }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API}/billing/payment-info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [open]);

  const plans = info?.plans || [];

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg [&>button]:hidden max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        data-testid="trial-ended-modal"
      >
        <DialogHeader>
          <div className="inline-flex items-center gap-2 mb-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 text-xs font-semibold w-fit">
            <ShieldAlert className="w-3.5 h-3.5" />
            Tu prueba gratuita terminó
          </div>
          <DialogTitle className="text-lg font-bold">Activa tu plan para seguir vendiendo</DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Elige tu periodo, paga por el medio que prefieras y envía el comprobante. Tu tienda se reactiva en minutos.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="text-center text-slate-500 py-10 text-sm">Cargando planes…</div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              {BILLING_PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                    period === p.id
                      ? "bg-emerald-600 border-emerald-600 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              {plans.map((pl) => {
                const price = periodPrice(pl, period);
                const savings = periodSavingsPct(pl, period);
                return (
                  <div key={pl.id} className="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2">
                    <span className="text-sm font-medium text-slate-800">{pl.name}</span>
                    <span className="text-right">
                      <span className="text-sm font-bold text-emerald-700">
                        ${new Intl.NumberFormat("es-CO").format(price)}
                      </span>
                      {savings > 0 && (
                        <span className="ml-1.5 text-[10px] font-semibold text-emerald-600">-{savings}%</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              {info?.nequi_number && (
                <div className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="w-4 h-4 text-fuchsia-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">Nequi</div>
                      <div className="text-xs text-slate-500 truncate">{info.nequi_number}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(info.nequi_number, "Número Nequi", toast)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {info?.breb_key && (
                <div className="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Landmark className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-700">Bre-B</div>
                      <div className="text-xs text-slate-500 truncate">{info.breb_key}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(info.breb_key, "Llave Bre-B", toast)}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
              {info?.bank_info && (
                <div className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-slate-700 mb-1">Cuenta bancaria</div>
                  <div className="text-xs text-slate-500 whitespace-pre-line">{info.bank_info}</div>
                </div>
              )}
              {!info?.nequi_number && !info?.breb_key && !info?.bank_info && !info?.qr_url && (
                <div className="text-xs text-slate-500 text-center py-2">
                  Los medios de pago aún no están configurados. Contacta a soporte para activar tu plan.
                </div>
              )}
            </div>

            <Button className="w-full" variant="secondary" onClick={() => navigate("/paywall")}>
              <ExternalLink className="w-4 h-4 mr-2" /> Ver todos los detalles y pagar por QR
            </Button>
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          className="flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mt-1"
        >
          <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
        </button>
      </DialogContent>
    </Dialog>
  );
}
