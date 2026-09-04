import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Settings2, Save, Palette, Bot, Store, Printer, Sliders, Eye, EyeOff,
  Sparkles, CheckCircle2, AlertCircle, RefreshCw, HelpCircle, ShieldCheck
} from "lucide-react";

export const ACCENTS = {
  emerald: { label: "Esmeralda", hsl: "142 72% 29%", hex: "#15803D" },
  ocean: { label: "Océano", hsl: "210 90% 40%", hex: "#0B63CE" },
  violet: { label: "Violeta", hsl: "262 80% 50%", hex: "#7C3AED" },
  terracotta: { label: "Terracota", hsl: "24 90% 40%", hex: "#C2410C" },
  berry: { label: "Baya", hsl: "340 75% 45%", hex: "#C0264F" },
  amber: { label: "Ámbar", hsl: "38 92% 50%", hex: "#D97706" },
  rose: { label: "Rosa", hsl: "347 77% 60%", hex: "#E11D48" },
  slate: { label: "Pizarra", hsl: "222 30% 30%", hex: "#33415C" },
};

export const AI_PROVIDERS = [
  {
    id: "gemini",
    name: "Google Gemini",
    badge: "Oficial / Recomendado",
    defaultModel: "gemini-1.5-flash",
    models: [
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Rápido y Gratis)" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Nueva Gen)" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Alta Precisión)" },
    ],
    helpUrl: "https://aistudio.google.com/app/apikey",
    placeholder: "AIzaSy...",
  },
  {
    id: "openrouter",
    name: "OpenRouter (Modelos Gratuitos)",
    badge: "100% Free Tiers Disponibles",
    defaultModel: "google/gemini-2.0-flash-exp:free",
    models: [
      { id: "google/gemini-2.0-flash-exp:free", name: "Google Gemini 2.0 Flash Exp (Gratis)" },
      { id: "meta-llama/llama-3.2-11b-vision-instruct:free", name: "Llama 3.2 11B Vision (Gratis)" },
      { id: "qwen/qwen-2.5-vl-72b-instruct:free", name: "Qwen 2.5 VL 72B (Gratis)" },
      { id: "meta-llama/llama-3.2-90b-vision-instruct", name: "Llama 3.2 90B Vision" },
    ],
    helpUrl: "https://openrouter.ai/keys",
    placeholder: "sk-or-v1-...",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM / Build",
    badge: "Créditos Gratuitos",
    defaultModel: "meta/llama-3.2-11b-vision-instruct",
    models: [
      { id: "meta/llama-3.2-11b-vision-instruct", name: "Meta Llama 3.2 11B Vision" },
      { id: "nvidia/neva-22b", name: "NVIDIA NeVA 22B Vision" },
    ],
    helpUrl: "https://build.nvidia.com/",
    placeholder: "nvapi-...",
  },
  {
    id: "groq",
    name: "Groq Cloud",
    badge: "Inferencia Ultra Rápida",
    defaultModel: "llama-3.2-11b-vision-preview",
    models: [
      { id: "llama-3.2-11b-vision-preview", name: "Llama 3.2 11B Vision (Groq LPU)" },
      { id: "llama-3.2-90b-vision-preview", name: "Llama 3.2 90B Vision (Groq LPU)" },
    ],
    helpUrl: "https://console.groq.com/keys",
    placeholder: "gsk_...",
  },
  {
    id: "custom_openai",
    name: "OpenAI Compatible / Local",
    badge: "Custom Endpoint",
    defaultModel: "gpt-4o-mini",
    models: [
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4o", name: "GPT-4o" },
    ],
    helpUrl: "https://platform.openai.com/api-keys",
    placeholder: "sk-...",
  },
];

export function applyAccent(accent) {
  const a = ACCENTS[accent] || ACCENTS.emerald;
  document.documentElement.style.setProperty("--primary", a.hsl);
  document.documentElement.style.setProperty("--ring", a.hsl);
  localStorage.setItem("jrpos_accent", accent);
}

export default function Settings() {
  const [form, setForm] = useState({
    store_name: "JRPOS",
    store_slogan: "",
    store_nit: "",
    store_address: "",
    store_city: "",
    store_department: "",
    tax_regime: "No responsable de IVA",
    currency_symbol: "$",
    
    ticket_footer: "¡Gracias por su compra!",
    ticket_header_line1: "",
    ticket_header_line2: "",
    ticket_show_barcode: true,
    
    iva_default: 19,
    printer_width: 58,
    accent: "emerald",
    support_phone: "",
    
    ai_provider: "gemini",
    ai_api_key: "",
    ai_model: "gemini-1.5-flash",
    ai_base_url: "",
    
    pos_audio_beep: true,
    pos_ask_clear_cart: true,
    pos_require_credit_customer: true,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testingAI, setTestingAI] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const dirty = useRef(false);

  useEffect(() => {
    const cached = localStorage.getItem("jrpos_settings");
    if (cached) {
      try { setForm((prev) => ({ ...prev, ...JSON.parse(cached) })); } catch { /* noop */ }
    }
    api.get("/settings/general").then((r) => {
      if (r.data && typeof r.data === "object") {
        if (!dirty.current) setForm((prev) => ({ ...prev, ...r.data }));
        if (r.data.accent) applyAccent(r.data.accent);
      }
    }).catch(() => {});
  }, []);

  const update = (changes) => {
    dirty.current = true;
    setForm((prev) => ({ ...prev, ...changes }));
  };

  const currentProviderConfig = useMemo(() => {
    return AI_PROVIDERS.find((p) => p.id === form.ai_provider) || AI_PROVIDERS[0];
  }, [form.ai_provider]);

  const handleProviderChange = (newProvider) => {
    const pConfig = AI_PROVIDERS.find((p) => p.id === newProvider);
    update({
      ai_provider: newProvider,
      ai_model: pConfig?.defaultModel || "",
      ai_base_url: "",
    });
    setAiTestResult(null);
  };

  const testAI = async () => {
    setTestingAI(true);
    setAiTestResult(null);
    try {
      const { data } = await api.post("/settings/test-ai", {
        provider: form.ai_provider,
        api_key: form.ai_api_key,
        model: form.ai_model,
        base_url: form.ai_base_url,
      });
      setAiTestResult({ ok: true, message: data.message, response: data.response });
      toast.success(data.message);
    } catch (e) {
      const errMsg = e?.response?.data?.detail || e.message || "Error al conectar con la IA";
      setAiTestResult({ ok: false, message: errMsg });
      toast.error(errMsg);
    } finally {
      setTestingAI(false);
    }
  };

  const save = async () => {
    try {
      await api.put("/settings/general", {
        ...form,
        iva_default: Number(form.iva_default),
        printer_width: Number(form.printer_width),
      });
      applyAccent(form.accent);
      localStorage.setItem("jrpos_settings", JSON.stringify(form));
      toast.success("Configuración guardada exitosamente");
      setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error guardando configuración");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl" data-testid="settings-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
            <Settings2 className="w-7 h-7 text-emerald-700" /> Centro de Configuración
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Personaliza la identidad de tu tienda, motores de Inteligencia Artificial (OCR), impresión térmica y preferencias de caja.
          </p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800 h-11 px-6 font-bold shrink-0 shadow-sm" onClick={save} data-testid="save-settings-btn">
          <Save className="w-4 h-4 mr-2" /> Guardar Cambios
        </Button>
      </div>

      <Tabs defaultValue="ai" className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 h-auto p-1 bg-slate-100 rounded-lg">
          <TabsTrigger value="ai" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Bot className="w-4 h-4" /> IA & OCR
          </TabsTrigger>
          <TabsTrigger value="store" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Store className="w-4 h-4" /> Tienda
          </TabsTrigger>
          <TabsTrigger value="printer" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Printer className="w-4 h-4" /> Recibo
          </TabsTrigger>
          <TabsTrigger value="theme" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Palette className="w-4 h-4" /> Temas
          </TabsTrigger>
          <TabsTrigger value="pos" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Sliders className="w-4 h-4" /> Caja POS
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: Inteligencia Artificial & OCR */}
        <TabsContent value="ai" className="space-y-4">
          <Card className="border-emerald-100 shadow-xs">
            <CardHeader className="bg-gradient-to-r from-emerald-50/50 via-slate-50 to-transparent border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 text-emerald-900">
                    <Sparkles className="w-5 h-5 text-emerald-700" /> Motor de Inteligencia Artificial (Escáner de Facturas OCR)
                  </CardTitle>
                  <CardDescription>
                    Selecciona tu proveedor de IA preferido. Puedes usar Google Gemini o proveedores con modelos gratuitos (OpenRouter, NVIDIA NIM, Groq).
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-emerald-100/60 text-emerald-800 border-emerald-300 font-medium">
                  {currentProviderConfig.badge}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5">
              {/* Proveedor selector */}
              <div>
                <label className="text-xs uppercase font-bold tracking-wider text-slate-600 block mb-1.5">
                  Proveedor de IA
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {AI_PROVIDERS.map((prov) => {
                    const active = form.ai_provider === prov.id;
                    return (
                      <button
                        type="button"
                        key={prov.id}
                        onClick={() => handleProviderChange(prov.id)}
                        className={`p-3 rounded-lg border text-left transition flex flex-col justify-between ${
                          active
                            ? "bg-emerald-50/70 border-emerald-600 ring-2 ring-emerald-600/20"
                            : "bg-white border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="font-bold text-sm text-slate-900">{prov.name}</div>
                        <div className="text-[11px] text-slate-500 mt-1">{prov.badge}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* API Key input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs uppercase font-bold tracking-wider text-slate-600">
                    API Key ({currentProviderConfig.name})
                  </label>
                  {currentProviderConfig.helpUrl && (
                    <a
                      href={currentProviderConfig.helpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-emerald-700 hover:underline flex items-center gap-1 font-medium"
                    >
                      <HelpCircle className="w-3.5 h-3.5" /> Obtener clave de {currentProviderConfig.name}
                    </a>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={form.ai_api_key || ""}
                    onChange={(e) => update({ ai_api_key: e.target.value })}
                    placeholder={currentProviderConfig.placeholder}
                    className="pr-10 font-mono text-sm"
                    data-testid="ai-api-key-input"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Tu clave se almacena de forma segura en la base de datos de tu tienda y nunca es compartida.
                </p>
              </div>

              {/* Modelo selector */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs uppercase font-bold tracking-wider text-slate-600 block mb-1.5">
                    Modelo de Visión / OCR
                  </label>
                  <Select value={form.ai_model || currentProviderConfig.defaultModel} onValueChange={(v) => update({ ai_model: v })}>
                    <SelectTrigger className="h-10" data-testid="ai-model-select">
                      <SelectValue placeholder="Selecciona un modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentProviderConfig.models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs uppercase font-bold tracking-wider text-slate-600 block mb-1.5">
                    Nombre o ID Personalizado del Modelo (Opcional)
                  </label>
                  <Input
                    value={form.ai_model || ""}
                    onChange={(e) => update({ ai_model: e.target.value })}
                    placeholder="Ej: google/gemini-2.0-flash-exp:free"
                    className="h-10 font-mono text-xs"
                    data-testid="ai-custom-model-input"
                  />
                </div>
              </div>

              {/* Base URL (si aplica) */}
              {(form.ai_provider === "custom_openai" || form.ai_provider === "openrouter") && (
                <div>
                  <label className="text-xs uppercase font-bold tracking-wider text-slate-600 block mb-1.5">
                    URL Base del API (Endpoint OpenAI Compatible)
                  </label>
                  <Input
                    value={form.ai_base_url || ""}
                    onChange={(e) => update({ ai_base_url: e.target.value })}
                    placeholder={form.ai_provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1"}
                    className="h-10 font-mono text-xs"
                  />
                </div>
              )}

              {/* Test Button & Results */}
              <div className="pt-2 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={testAI}
                  disabled={testingAI}
                  className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  data-testid="test-ai-btn"
                >
                  {testingAI ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Verificando conexión...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 mr-2 text-emerald-700" /> Probar Conexión con IA
                    </>
                  )}
                </Button>

                {aiTestResult && (
                  <div className={`text-xs p-2 rounded flex items-center gap-1.5 ${aiTestResult.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                    {aiTestResult.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                    <span className="font-medium">{aiTestResult.message}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: Identidad & Tienda */}
        <TabsContent value="store" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Datos Comerciales & Tributarios</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Nombre Comercial de la Tienda</label>
                <Input value={form.store_name} onChange={(e) => update({ store_name: e.target.value })} data-testid="s-store-name" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Slogan / Subtítulo</label>
                <Input value={form.store_slogan || ""} onChange={(e) => update({ store_slogan: e.target.value })} placeholder="Ej: Tienda y Droguería de Barrio" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">NIT / Cédula / RUT</label>
                <Input value={form.store_nit || ""} onChange={(e) => update({ store_nit: e.target.value })} placeholder="900.123.456-7" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Régimen Tributario</label>
                <Select value={form.tax_regime || "No responsable de IVA"} onValueChange={(v) => update({ tax_regime: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="No responsable de IVA">No responsable de IVA</SelectItem>
                    <SelectItem value="Responsable de IVA">Responsable de IVA</SelectItem>
                    <SelectItem value="Régimen Simple de Tributación">Régimen Simple de Tributación</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Dirección del Establecimiento</label>
                <Input value={form.store_address || ""} onChange={(e) => update({ store_address: e.target.value })} placeholder="Calle 10 # 5-20" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Ciudad / Municipio</label>
                <Input value={form.store_city || ""} onChange={(e) => update({ store_city: e.target.value })} placeholder="Bogotá D.C." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Departamento</label>
                <Input value={form.store_department || ""} onChange={(e) => update({ store_department: e.target.value })} placeholder="Cundinamarca" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Teléfono / WhatsApp de Soporte</label>
                <Input value={form.support_phone} onChange={(e) => update({ support_phone: e.target.value })} placeholder="3001234567" data-testid="s-support" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">IVA por defecto (%)</label>
                <Input type="number" value={form.iva_default} onChange={(e) => update({ iva_default: e.target.value })} data-testid="s-iva" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Símbolo de Moneda</label>
                <Input value={form.currency_symbol || "$"} onChange={(e) => update({ currency_symbol: e.target.value })} placeholder="$" className="w-24" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Impresión & Recibo */}
        <TabsContent value="printer" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Formato del Ticket Térmico</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Ancho del papel de impresora</label>
                  <Select value={String(form.printer_width)} onValueChange={(v) => update({ printer_width: Number(v) })}>
                    <SelectTrigger className="h-10" data-testid="s-printer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58 mm (32 caracteres por línea)</SelectItem>
                      <SelectItem value="80">80 mm (48 caracteres por línea)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Pie del recibo (Agradecimiento)</label>
                  <Input value={form.ticket_footer} onChange={(e) => update({ ticket_footer: e.target.value })} data-testid="s-footer" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Línea de Encabezado 1 (Opcional)</label>
                  <Input value={form.ticket_header_line1 || ""} onChange={(e) => update({ ticket_header_line1: e.target.value })} placeholder="Ej: Régimen Común · Gran Contribuyente" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Línea de Encabezado 2 (Opcional)</label>
                  <Input value={form.ticket_header_line2 || ""} onChange={(e) => update({ ticket_header_line2: e.target.value })} placeholder="Ej: Horario: Lun-Sáb 7am a 9pm" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: Temas Visuales */}
        <TabsContent value="theme" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Palette className="w-5 h-5 text-emerald-700" /> Color de Acento y Marca</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(ACCENTS).map(([key, a]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => update({ accent: key })}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition text-left ${form.accent === key ? "border-slate-900 bg-slate-50/80 shadow-xs" : "border-slate-200 hover:border-slate-300"}`}
                    data-testid={`accent-${key}`}
                  >
                    <span className="w-8 h-8 rounded-full shadow-inner shrink-0" style={{ background: a.hex }} />
                    <span className="text-xs font-bold text-slate-800">{a.label}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5: Preferencias de Caja POS */}
        <TabsContent value="pos" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Comportamiento del Punto de Venta</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                <div>
                  <div className="font-semibold text-sm text-slate-900">Sonido Beep al Escanear</div>
                  <div className="text-xs text-slate-500">Reproduce un tono de audio de 1400Hz cuando se agrega un producto al carrito.</div>
                </div>
                <Switch checked={form.pos_audio_beep} onCheckedChange={(v) => update({ pos_audio_beep: v })} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                <div>
                  <div className="font-semibold text-sm text-slate-900">Confirmación para Vaciar Carrito (F4)</div>
                  <div className="text-xs text-slate-500">Pide confirmación antes de borrar todos los productos añadidos.</div>
                </div>
                <Switch checked={form.pos_ask_clear_cart} onCheckedChange={(v) => update({ pos_ask_clear_cart: v })} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                <div>
                  <div className="font-semibold text-sm text-slate-900">Exigir Cliente en Ventas a Crédito (Fiado)</div>
                  <div className="text-xs text-slate-500">Bloquea el botón de cobro si no se ha asignado un contacto deudor.</div>
                </div>
                <Switch checked={form.pos_require_credit_customer} onCheckedChange={(v) => update({ pos_require_credit_customer: v })} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

