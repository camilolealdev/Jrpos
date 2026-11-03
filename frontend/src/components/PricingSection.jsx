import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, Clock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BILLING_PERIODS, fePeriodPrice, periodPrice, periodSavingsPct } from "@/lib/billing";
import { formatCOP, whatsappUrl } from "@/lib/format";

// Solo lo que hoy funciona. La facturación DIAN va aparte, como "en preparación".
const INCLUDED = [
  "Vende sin internet: las ventas se sincronizan al reconectar",
  "Escáner con la cámara del celular (códigos de barras y QR)",
  "Escaneo de facturas de proveedor con IA",
  "Fiados con cartera por cliente y recordatorio por WhatsApp",
  "Caja con arqueo y cierre Z",
  "Control de merma y listas de precios por cliente",
  "Permisos por empleado",
  "Datos de cada tienda aislados de las demás",
  "Exportación contable con IVA 0%, 5% y 19%",
];

const PER_PERIOD = { monthly: "mes", quarterly: "trimestre", annual: "año" };
const nf = new Intl.NumberFormat("es-CO");

// Pastillas de selección (periodo / factura electrónica): mismo aspecto de siempre, con respuesta al presionar.
const pill = (active) =>
  `px-4 py-2 min-h-[44px] rounded-full text-xs font-semibold border transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none ${
    active
      ? "bg-emerald-600 border-emerald-500 text-white"
      : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
  }`;

export default function PricingSection({ whatsapp }) {
  const [plans, setPlans] = useState(null); // null = cargando, [] = error / vacío
  const [period, setPeriod] = useState("monthly");
  const [withFe, setWithFe] = useState(false); // ver precio con factura electrónica
  const ref = useRef(null);
  const { hash } = useLocation();

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPlans(Array.isArray(d) ? [...d].sort((a, b) => a.price_cop - b.price_cop) : []))
      .catch(() => setPlans([]));
  }, []);

  useEffect(() => {
    if (hash === "#precios") ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);

  const months = BILLING_PERIODS.find((p) => p.id === period)?.months || 1;
  const hasFe = Boolean(plans?.some((p) => p.fe_addon_cop > 0));
  const help = whatsappUrl(whatsapp, "Hola, tengo una pregunta sobre los planes de JRPOS 🏪");

  return (
    <section
      id="precios"
      ref={ref}
      className="relative z-10 w-full max-w-[90rem] mx-auto px-6 lg:px-10 py-12 border-t border-white/[0.06] scroll-mt-4"
      data-testid="pricing-section"
    >
      <div className="max-w-2xl">
        <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400 font-['JetBrains_Mono',ui-monospace,monospace]">
          Planes y precios
        </div>
        <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-white font-['Outfit',ui-sans-serif,system-ui,sans-serif]">
          Pruébalo 15 días gratis, sin tarjeta
        </h2>
        <p className="mt-2 text-sm sm:text-base text-slate-400 leading-relaxed">
          Todos los planes incluyen las mismas funciones. Lo que cambia es cuántas sedes, usuarios y productos
          necesitas. Precios en pesos colombianos, sin IVA.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo de pago">
          {BILLING_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              data-testid={`pricing-period-${p.id}`}
              className={pill(period === p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {hasFe && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Factura electrónica">
            {[
              { v: false, label: "Sin factura electrónica", tid: "without" },
              { v: true, label: "Con factura electrónica", tid: "with" },
            ].map((o) => (
              <button
                key={o.tid}
                type="button"
                onClick={() => setWithFe(o.v)}
                aria-pressed={withFe === o.v}
                data-testid={`pricing-fe-${o.tid}`}
                className={pill(withFe === o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasFe && withFe && (
        <p className="mt-3 max-w-2xl text-xs text-amber-300/90" data-testid="pricing-fe-hint">
          Precio de referencia: la factura electrónica se activa cuando conectemos un proveedor autorizado ante la
          DIAN. Hasta entonces no se cobra.
        </p>
      )}

      {plans === null && <p className="mt-8 text-sm text-slate-500">Cargando planes…</p>}

      {plans && plans.length === 0 && (
        <p className="mt-8 text-sm text-slate-400" data-testid="pricing-unavailable">
          No pudimos cargar los precios ahora mismo.{" "}
          {help && (
            <a href={help} target="_blank" rel="noreferrer" className="text-emerald-300 underline underline-offset-2">
              Escríbenos por WhatsApp
            </a>
          )}
        </p>
      )}

      {plans && plans.length > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
          {plans.map((pl) => {
            const basePrice = periodPrice(pl, period);
            const fePrice = withFe ? fePeriodPrice(pl, period) : 0;
            const price = basePrice + fePrice;
            const savings = periodSavingsPct(pl, period);
            return (
              <div
                key={pl.id}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                data-testid={`plan-card-${pl.id}`}
              >
                <h3 className="text-lg font-semibold text-white font-['Outfit',ui-sans-serif,system-ui,sans-serif]">{pl.name}</h3>
                <p className="mt-1 text-sm text-slate-400 min-h-[2.5rem]">{pl.description}</p>

                <div className="mt-4 font-['JetBrains_Mono',ui-monospace,monospace]">
                  <span className="text-2xl sm:text-3xl font-bold text-emerald-400">{formatCOP(price)}</span>
                  <span className="text-xs text-slate-500"> / {PER_PERIOD[period]} + IVA</span>
                </div>
                <div className="mt-1 h-5 text-xs text-slate-500">
                  {months > 1 && price > 0 && (
                    <>
                      ≈ {formatCOP(price / months)} al mes
                      {savings > 0 && <span className="ml-1.5 font-semibold text-emerald-400">ahorras {savings}%</span>}
                    </>
                  )}
                </div>
                <div className="h-4 text-[11px] text-slate-500" data-testid={`plan-breakdown-${pl.id}`}>
                  {withFe && fePrice > 0 && `Plan ${formatCOP(basePrice)} + factura electrónica ${formatCOP(fePrice)}`}
                </div>

                <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-300">
                  <li>{nf.format(pl.max_branches)} {pl.max_branches === 1 ? "sede" : "sedes"}</li>
                  <li>{nf.format(pl.max_users)} {pl.max_users === 1 ? "usuario" : "usuarios"}</li>
                  <li>Hasta {nf.format(pl.max_products)} productos</li>
                  {withFe && (
                    <li data-testid={`plan-fe-docs-${pl.id}`}>
                      {pl.fe_docs_year > 0
                        ? `Hasta ${nf.format(pl.fe_docs_year)} documentos DIAN al año`
                        : "Factura electrónica: consúltanos"}
                    </li>
                  )}
                </ul>

                <Button
                  asChild
                  className="mt-6 min-h-[44px] bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold rounded-xl"
                >
                  <Link to="/registro" data-testid={`plan-cta-${pl.id}`}>Probar 15 días gratis</Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h3 className="text-sm font-semibold text-white">Incluido en todos los planes</h3>
          <ul className="mt-3 space-y-2">
            {INCLUDED.map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-slate-300">
                <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-5 self-start" data-testid="pricing-dian-note">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <Clock className="w-4 h-4" /> Facturación electrónica DIAN: en preparación
          </div>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            Hoy los módulos de factura electrónica funcionan en modo de prueba y no tienen validez ante la DIAN.
            Estamos conectando un proveedor tecnológico autorizado, y no cobramos esta función hasta que esté lista.
            Si ya facturas con un proveedor, cuéntanos cuál usas.
          </p>
          {help && (
            <a
              href={help}
              target="_blank"
              rel="noreferrer"
              data-testid="pricing-whatsapp"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-300 hover:text-emerald-200"
            >
              <MessageCircle className="w-4 h-4" /> Preguntar por WhatsApp
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
