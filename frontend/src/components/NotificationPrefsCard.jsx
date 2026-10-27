import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, Save } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const EMPTY = {
  opt_in: false,
  channel: "whatsapp",
  trial_alerts: true,
  daily_digest: true,
  cash_diff_threshold: "",
  accountant_email: "",
  accountant_opt_in: false,
  accountant_consented_at: null,
};

function Row({ id, title, hint, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-slate-50/50">
      <label htmlFor={id} className="cursor-pointer">
        <div className="font-semibold text-sm text-slate-900">{title}</div>
        <div className="text-xs text-slate-500">{hint}</div>
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function NotificationPrefsCard() {
  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState(false); // la API solo atiende al administrador de la tienda
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api
      .get("/settings/notifications")
      .then(({ data }) => {
        setForm({ ...EMPTY, ...data, cash_diff_threshold: data.cash_diff_threshold ?? "", accountant_email: data.accountant_email ?? "" });
        setLoaded(true);
      })
      .catch((e) => (e?.response?.status === 403 ? setHidden(true) : toast.error("No se pudieron cargar tus preferencias de avisos")));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/settings/notifications", {
        opt_in: form.opt_in,
        channel: form.channel,
        trial_alerts: form.trial_alerts,
        daily_digest: form.daily_digest,
        cash_diff_threshold: form.cash_diff_threshold === "" ? null : Number(form.cash_diff_threshold),
        accountant_email: form.accountant_email.trim() || null,
        accountant_opt_in: form.accountant_opt_in,
      });
      set({ ...data, cash_diff_threshold: data.cash_diff_threshold ?? "", accountant_email: data.accountant_email ?? "" });
      toast.success("Preferencias de avisos guardadas");
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "No se pudieron guardar los avisos");
    } finally {
      setSaving(false);
    }
  };

  if (hidden) return null;
  const off = !form.opt_in;

  return (
    <Card className="border-emerald-100 shadow-xs" data-testid="notification-prefs-card">
      <CardHeader className="bg-gradient-to-r from-emerald-50/50 via-slate-50 to-transparent border-b">
        <CardTitle className="text-lg flex items-center gap-2 text-emerald-900">
          <Bell className="w-5 h-5 text-emerald-700" /> Avisos automáticos
        </CardTitle>
        <CardDescription>
          Mensajes breves para ti, el dueño: fin de la prueba, resumen del día, descuadres de caja. Nunca escribimos a tus clientes ni a tus empleados.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <Row
          id="notif-opt-in"
          title="Quiero recibir avisos"
          hint="Los enviamos al contacto con el que registraste la tienda. Puedes apagarlo cuando quieras."
          checked={form.opt_in}
          onChange={(v) => set({ opt_in: v })}
          disabled={!loaded}
        />

        <div className="space-y-1.5 max-w-xs">
          <label htmlFor="notif-channel" className="text-sm font-semibold text-slate-800">Canal</label>
          <Select value={form.channel} onValueChange={(v) => set({ channel: v })} disabled={off}>
            <SelectTrigger id="notif-channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">Correo electrónico</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Row id="notif-trial" title="Fin de la prueba gratuita" hint="Te avisamos 5 y 2 días antes, el día del vencimiento y el día siguiente." checked={form.trial_alerts} onChange={(v) => set({ trial_alerts: v })} disabled={off} />
        <Row id="notif-digest" title="Resumen diario" hint="Cada noche: ventas, margen, caja, fiados pendientes y productos con poco stock." checked={form.daily_digest} onChange={(v) => set({ daily_digest: v })} disabled={off} />

        <div className="space-y-1.5 max-w-xs">
          <label htmlFor="notif-threshold" className="text-sm font-semibold text-slate-800">Descuadre de caja que debe avisarte (COP)</label>
          <Input id="notif-threshold" type="number" min="0" step="1000" inputMode="numeric" placeholder="Vacío = valor estándar" value={form.cash_diff_threshold} onChange={(e) => set({ cash_diff_threshold: e.target.value })} disabled={off} />
          <p className="text-xs text-slate-500">Si al cerrar la caja faltan o sobran más de este valor, te avisamos.</p>
        </div>

        <div className="space-y-3 pt-3 border-t">
          <div>
            <div className="text-sm font-semibold text-slate-800">Tu contador (opcional)</div>
            <p className="text-xs text-slate-500">Es una persona externa a tu tienda: solo le enviamos datos si tú lo autorizas aquí.</p>
          </div>
          <div className="space-y-1.5 max-w-sm">
            <label htmlFor="notif-accountant" className="text-sm font-semibold text-slate-800">Correo del contador</label>
            <Input id="notif-accountant" type="email" autoComplete="off" placeholder="contador@ejemplo.com" value={form.accountant_email} onChange={(e) => set({ accountant_email: e.target.value })} disabled={off} />
          </div>
          <Row
            id="notif-accountant-opt"
            title="Autorizo enviar el cierre contable mensual a este correo"
            hint={form.accountant_consented_at ? `Autorizado el ${new Date(form.accountant_consented_at).toLocaleDateString("es-CO")}. Si cambias el correo debes autorizar de nuevo.` : "Incluye las ventas del mes anterior con sus impuestos. Puedes retirar la autorización cuando quieras."}
            checked={form.accountant_opt_in}
            onChange={(v) => set({ accountant_opt_in: v })}
            disabled={off || !form.accountant_email.trim()}
          />
        </div>

        <Button className="bg-emerald-700 hover:bg-emerald-800 font-bold" onClick={save} disabled={!loaded || saving} data-testid="save-notification-prefs">
          <Save className="w-4 h-4 mr-2" /> {saving ? "Guardando..." : "Guardar avisos"}
        </Button>
      </CardContent>
    </Card>
  );
}
