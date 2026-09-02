import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings2, Save, Palette } from "lucide-react";

export const ACCENTS = {
  emerald: { label: "Esmeralda", hsl: "142 72% 29%", hex: "#15803D" },
  ocean: { label: "Océano", hsl: "210 90% 40%", hex: "#0B63CE" },
  terracotta: { label: "Terracota", hsl: "24 90% 40%", hex: "#C2410C" },
  berry: { label: "Baya", hsl: "340 75% 45%", hex: "#C0264F" },
  slate: { label: "Pizarra", hsl: "222 30% 30%", hex: "#33415C" },
};

export function applyAccent(accent) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  document.documentElement.style.setProperty("--primary", a.hsl);
  document.documentElement.style.setProperty("--ring", a.hsl);
  localStorage.setItem("jrpos_accent", accent);
}

export default function Settings() {
  const [form, setForm] = useState({ store_name: "JRPOS", ticket_footer: "¡Gracias por su compra!", iva_default: 19, printer_width: 58, accent: "emerald", support_phone: "" });

  useEffect(() => {
    api.get("/settings/general").then((r) => {
      setForm(r.data);
      applyAccent(r.data.accent);
    });
  }, []);

  const save = async () => {
    try {
      await api.put("/settings/general", { ...form, iva_default: Number(form.iva_default), printer_width: Number(form.printer_width) });
      applyAccent(form.accent);
      localStorage.setItem("jrpos_settings", JSON.stringify(form));
      toast.success("Configuración guardada");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) { toast.error(e?.response?.data?.detail || "Error guardando"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl" data-testid="settings-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Settings2 className="w-6 h-6 text-emerald-700" /> Configuración General</h1>
        <p className="text-sm text-slate-500">Datos de la tienda, impresión y personalización visual.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Tienda y recibo</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold">Nombre de la tienda</label>
            <Input value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} data-testid="s-store-name" /></div>
          <div><label className="text-xs font-semibold">Pie del recibo</label>
            <Input value={form.ticket_footer} onChange={(e) => setForm({ ...form, ticket_footer: e.target.value })} data-testid="s-footer" /></div>
          <div><label className="text-xs font-semibold">IVA por defecto (%)</label>
            <Input type="number" value={form.iva_default} onChange={(e) => setForm({ ...form, iva_default: e.target.value })} data-testid="s-iva" /></div>
          <div><label className="text-xs font-semibold">WhatsApp de soporte</label>
            <Input value={form.support_phone} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} placeholder="3001234567" data-testid="s-support" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Impresión térmica</CardTitle></CardHeader>
        <CardContent>
          <label className="text-xs font-semibold">Ancho del papel</label>
          <Select value={String(form.printer_width)} onValueChange={(v) => setForm({ ...form, printer_width: Number(v) })}>
            <SelectTrigger className="w-48" data-testid="s-printer"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="58">58 mm (32 caracteres)</SelectItem>
              <SelectItem value="80">80 mm (48 caracteres)</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Palette className="w-5 h-5" /> Color de acento</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {Object.entries(ACCENTS).map(([key, a]) => (
              <button
                key={key}
                onClick={() => setForm({ ...form, accent: key })}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition ${form.accent === key ? "border-slate-900" : "border-transparent hover:border-slate-300"}`}
                data-testid={`accent-${key}`}
              >
                <span className="w-10 h-10 rounded-full shadow-inner" style={{ background: a.hex }} />
                <span className="text-xs font-semibold">{a.label}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button className="bg-emerald-700 hover:bg-emerald-800 h-11 px-6 font-bold" onClick={save} data-testid="save-settings-btn">
        <Save className="w-4 h-4 mr-1" /> Guardar configuración
      </Button>
    </div>
  );
}
