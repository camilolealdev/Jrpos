import { useEffect, useState } from "react";
import { QrCode, ShieldCheck, MessageCircle, RefreshCw, Copy, Smartphone, Landmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { BILLING_PERIODS, periodPrice, periodSavingsPct, copyToClipboard } from "../lib/billing";

const API = "/api";

export default function Paywall() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("monthly");

  const load = () => {
    setLoading(true);
    fetch(`${API}/billing/payment-info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const wa = info?.whatsapp
    ? `https://wa.me/${info.whatsapp}?text=${encodeURIComponent("Hola, pago mi suscripcion JRPOS. Adjunto comprobante de pago.")}`
    : null;

  const periodMonths = BILLING_PERIODS.find((p) => p.id === period)?.months || 1;

  return (
    <div className="min-h-screen bg-[#07100c] text-slate-200 flex items-center justify-center p-4" data-testid="paywall">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
            <ShieldCheck className="w-4 h-4" />
            Tu prueba gratuita terminó
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Activa tu plan JRPOS</h1>
          <p className="text-slate-400 mt-2 text-sm">
            Elige tu periodo, paga por el medio que prefieras, envía el comprobante y tu tienda queda activa en minutos.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-slate-500 py-16">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" /> Cargando…
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-2 mb-6">
              {BILLING_PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    period === p.id
                      ? "bg-emerald-600 border-emerald-500 text-white"
                      : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
                  }`}
                  data-testid={`period-${p.id}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Card className="bg-white/5 border-white/10">
                  <CardContent className="p-6 text-center">
                    <div className="flex items-center justify-center gap-2 text-emerald-400 mb-4 text-sm font-semibold">
                      <QrCode className="w-4 h-4" /> Pago por QR / Transferencia
                    </div>
                    {info?.qr_url ? (
                      <img
                        src={info.qr_url}
                        alt="QR de pago JRPOS"
                        className="mx-auto w-48 h-48 rounded-xl bg-white p-2"
                        data-testid="paywall-qr"
                      />
                    ) : (
                      <div className="w-48 h-48 mx-auto rounded-xl bg-white/5 grid place-items-center text-slate-500 text-xs">
                        QR no configurado
                      </div>
                    )}
                    {info?.bank_info && (
                      <p className="text-[13px] text-slate-300 mt-4 whitespace-pre-line">{info.bank_info}</p>
                    )}
                  </CardContent>
                </Card>

                {info?.nequi_number && (
                  <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Smartphone className="w-5 h-5 text-fuchsia-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Nequi</div>
                          <div className="text-xs text-slate-400" data-testid="paywall-nequi-number">{info.nequi_number}</div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-slate-200 hover:text-white"
                        onClick={() => copyToClipboard(info.nequi_number, "Número Nequi", toast)}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {info?.breb_key && (
                  <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Landmark className="w-5 h-5 text-sky-400 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold text-white">Bre-B</div>
                          <div className="text-xs text-slate-400" data-testid="paywall-breb-key">{info.breb_key}</div>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-slate-200 hover:text-white"
                        onClick={() => copyToClipboard(info.breb_key, "Llave Bre-B", toast)}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer">
                    <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
                      <MessageCircle className="w-4 h-4 mr-2" /> Enviar comprobante por WhatsApp
                    </Button>
                  </a>
                )}
              </div>

              <div className="space-y-4">
                {(info?.plans || []).map((pl) => {
                  const price = periodPrice(pl, period);
                  const savings = periodSavingsPct(pl, period);
                  return (
                    <Card key={pl.id} className="bg-white/5 border-white/10">
                      <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">{pl.name}</div>
                            {pl.description && <div className="text-xs text-slate-400 mt-0.5">{pl.description}</div>}
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-emerald-400" data-testid={`plan-${pl.id}`}>
                              ${new Intl.NumberFormat("es-CO").format(price)}
                            </div>
                            <div className="text-[10px] text-slate-500">COP / {periodMonths === 1 ? "mes" : `${periodMonths} meses`}</div>
                            {savings > 0 && (
                              <div className="text-[10px] font-semibold text-emerald-400 mt-0.5">Ahorra {savings}%</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 mt-3 text-[11px] text-slate-400">
                          <span>{pl.max_users} usuarios</span>
                          <span>·</span>
                          <span>{new Intl.NumberFormat("es-CO").format(pl.max_products)} productos</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                <p className="text-[11px] text-slate-500 text-center">
                  Tras confirmar tu pago, el administrador de la plataforma activa tu plan. Recibirás acceso inmediato.
                </p>
              </div>
            </div>
          </>
        )}

        <div className="text-center mt-8">
          <a href="/login" className="text-slate-400 hover:text-slate-200 text-sm underline underline-offset-4">
            Volver al inicio de sesión
          </a>
        </div>
      </div>
    </div>
  );
}
