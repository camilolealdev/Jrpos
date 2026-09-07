import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Settings2, Save, Palette, Bot, Store, Printer, Sliders, Eye, EyeOff,
  Sparkles, CheckCircle2, AlertCircle, RefreshCw, HelpCircle, ShieldCheck,
  Database, Trash2, AlertTriangle, ShieldAlert, ShoppingBag, Users, FileText, CheckCircle
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
  
  // Data Management & Production Wipe
  const [dataStats, setDataStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [seedingDemo, setSeedingDemo] = useState(false);
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [wipeScope, setWipeScope] = useState("transactions_only");
  const [wipeConfirmPhrase, setWipeConfirmPhrase] = useState("");
  const [wiping, setWiping] = useState(false);

  const dirty = useRef(false);

  const loadDataStats = async () => {
    setLoadingStats(true);
    try {
      const { data } = await api.get("/settings/data-stats");
      setDataStats(data);
    } catch {
      // noop
    } finally {
      setLoadingStats(false);
    }
  };

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
    loadDataStats();
  }, []);

  const loadDemoData = async (force = false) => {
    setSeedingDemo(true);
    try {
      const { data } = await api.post(`/seed${force ? "?force=true" : ""}`);
      if (data.seeded) {
        toast.success(data.message || `Se cargaron ${data.products} productos demo y ${data.contacts} contactos`);
      } else {
        toast.info(data.message || "El sistema ya cuenta con datos cargados");
      }
      loadDataStats();
    } catch (e) {
      toast.error("Error al cargar datos de demostración");
    } finally {
      setSeedingDemo(false);
    }
  };

  const handleWipeData = async () => {
    const normalized = wipeConfirmPhrase.trim().toUpperCase();
    if (!["BORRAR", "PRODUCCION", "PRODUCCIÓN", "RESET", "LIMPIAR"].includes(normalized)) {
      toast.error("Debes escribir exactamente 'PRODUCCION' o 'BORRAR' para autorizar el vaciado.");
      return;
    }
    setWiping(true);
    try {
      const { data } = await api.post("/settings/wipe-data", {
        confirm_phrase: normalized,
        scope: wipeScope,
        keep_products: wipeScope === "transactions_only",
        keep_contacts: wipeScope === "transactions_only",
      });
      toast.success(data.message || "Base de datos preparada exitosamente para producción.");
      setWipeDialogOpen(false);
      setWipeConfirmPhrase("");
      loadDataStats();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error durante la limpieza de datos");
    } finally {
      setWiping(false);
    }
  };

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
      window.dispatchEvent(new CustomEvent("jrpos_settings_updated", { detail: form }));
      toast.success("¡Datos de la tienda y configuración guardados con éxito!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Error guardando configuración");
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl" data-testid="settings-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2 text-slate-900">
            <Store className="w-7 h-7 text-emerald-700" /> Configuración de la Tienda & Sistema
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Personaliza el nombre de tu establecimiento, NIT, dirección, teléfono, temas visuales y motores de IA.
          </p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800 h-11 px-6 font-bold shrink-0 shadow-sm" onClick={save} data-testid="save-settings-btn">
          <Save className="w-4 h-4 mr-2" /> Guardar Cambios
        </Button>
      </div>

      <Tabs defaultValue="store" className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 h-auto p-1 bg-slate-100 rounded-lg">
          <TabsTrigger value="store" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Store className="w-4 h-4" /> Datos Tienda
          </TabsTrigger>
          <TabsTrigger value="theme" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Palette className="w-4 h-4" /> Temas
          </TabsTrigger>
          <TabsTrigger value="printer" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Printer className="w-4 h-4" /> Recibo
          </TabsTrigger>
          <TabsTrigger value="ai" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Bot className="w-4 h-4" /> IA & OCR
          </TabsTrigger>
          <TabsTrigger value="pos" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs">
            <Sliders className="w-4 h-4" /> Caja POS
          </TabsTrigger>
          <TabsTrigger value="data" className="py-2.5 text-xs sm:text-sm font-semibold flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-xs" data-testid="tab-data-mgmt">
            <Database className="w-4 h-4" /> Datos & Prod
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

        {/* TAB 1: Identidad & Tienda */}
        <TabsContent value="store" className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Store className="w-5 h-5 text-emerald-700" /> Datos Comerciales & Tributarios
                </CardTitle>
                <CardDescription>
                  Estos datos aparecerán en la barra lateral del sistema, en los recibos impresos y en las facturas de venta.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nombre Comercial del Establecimiento *</label>
                  <Input value={form.store_name} onChange={(e) => update({ store_name: e.target.value })} placeholder="Ej: Minimarket La Esquina" data-testid="s-store-name" className="text-base font-semibold" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Slogan / Actividad</label>
                  <Input value={form.store_slogan || ""} onChange={(e) => update({ store_slogan: e.target.value })} placeholder="Ej: Víveres, Abarrotes y Droguería" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">NIT / RUT / Cédula</label>
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
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Teléfono / WhatsApp de Atención</label>
                  <Input value={form.support_phone} onChange={(e) => update({ support_phone: e.target.value })} placeholder="300 123 4567" data-testid="s-support" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Dirección del Establecimiento</label>
                  <Input value={form.store_address || ""} onChange={(e) => update({ store_address: e.target.value })} placeholder="Calle 10 # 5-20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Ciudad / Municipio</label>
                  <Input value={form.store_city || ""} onChange={(e) => update({ store_city: e.target.value })} placeholder="Medellín" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Departamento</label>
                  <Input value={form.store_department || ""} onChange={(e) => update({ store_department: e.target.value })} placeholder="Antioquia" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">IVA por defecto (%)</label>
                  <Input type="number" value={form.iva_default} onChange={(e) => update({ iva_default: e.target.value })} data-testid="s-iva" />
                </div>
              </CardContent>
            </Card>

            {/* Vista previa en vivo */}
            <Card className="bg-slate-50 dark:bg-slate-900 border-dashed border-2">
              <CardHeader>
                <CardTitle className="text-sm text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" /> Vista Previa en Vivo
                </CardTitle>
                <CardDescription className="text-xs">
                  Así se verá el encabezado de tu tienda en el menú y tickets:
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview barra lateral */}
                <div className="p-3 bg-white dark:bg-slate-950 rounded-lg border shadow-xs">
                  <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">En el Menú:</div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-emerald-700 text-white grid place-items-center shadow-xs shrink-0">
                      <Store className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{form.store_name || "Mi Tienda"}</div>
                      <div className="text-[10px] text-slate-500 truncate">{form.store_nit ? `NIT: ${form.store_nit}` : (form.store_slogan || "Punto de Venta")}</div>
                    </div>
                  </div>
                </div>

                {/* Preview ticket */}
                <div className="p-3.5 bg-white dark:bg-slate-950 rounded-lg border font-mono text-xs shadow-xs text-center space-y-1">
                  <div className="text-[10px] text-slate-400 font-sans font-bold uppercase mb-2">En el Ticket de Venta:</div>
                  <div className="font-bold text-sm tracking-tight">{form.store_name || "MI TIENDA"}</div>
                  {form.store_slogan && <div className="text-[11px] text-slate-500 italic">{form.store_slogan}</div>}
                  {form.store_nit && <div className="text-[11px]">NIT: {form.store_nit}</div>}
                  {form.store_address && <div className="text-[10px]">{form.store_address}{form.store_city ? `, ${form.store_city}` : ""}</div>}
                  {form.support_phone && <div className="text-[10px]">Tel: {form.support_phone}</div>}
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-dashed my-1">
                    {form.tax_regime}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold pt-1">
                    {form.ticket_footer || "¡Gracias por su compra!"}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
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
                    onClick={() => {
                      update({ accent: key });
                      applyAccent(key);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition text-left ${form.accent === key ? "border-slate-900 bg-slate-50/80 shadow-xs ring-2 ring-emerald-500/30" : "border-slate-200 hover:border-slate-300"}`}
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 6: Gestión de Datos & Producción */}
        <TabsContent value="data" className="space-y-6">
          {/* Métricas de Base de Datos */}
          <Card className="border-slate-200">
            <CardHeader className="bg-slate-50/70 border-b flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                  <Database className="w-5 h-5 text-emerald-700" /> Auditoría de Registros en Base de Datos
                </CardTitle>
                <CardDescription>
                  Estado actual de las tablas operativas y transaccionales del sistema.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadDataStats}
                disabled={loadingStats}
                className="h-8 text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loadingStats ? "animate-spin" : ""}`} /> Actualizar
              </Button>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-3 rounded-lg border bg-slate-50/60 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase">Productos</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{dataStats?.products ?? "-"}</div>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/60 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase">Contactos</div>
                  <div className="text-2xl font-black text-slate-900 mt-1">{dataStats?.contacts ?? "-"}</div>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/60 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase">Ventas</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">{dataStats?.sales ?? "-"}</div>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/60 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase">Gastos</div>
                  <div className="text-2xl font-black text-amber-700 mt-1">{dataStats?.expenses ?? "-"}</div>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/60 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase">Facturas Compra</div>
                  <div className="text-2xl font-black text-blue-700 mt-1">{dataStats?.invoices ?? "-"}</div>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/60 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase">Sesiones Caja</div>
                  <div className="text-2xl font-black text-purple-700 mt-1">{dataStats?.cash_sessions ?? "-"}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 p-3 rounded-lg border bg-emerald-50/40 border-emerald-200 text-xs text-emerald-900">
                <CheckCircle className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  {dataStats?.is_clean_slate
                    ? "Base de datos en blanco: No hay ventas ni gastos de prueba registrados. El sistema está 100% listo para producción."
                    : "Base de datos con registros: Contiene movimientos de prueba o transacciones operativas activas."}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Carga de Datos Demo */}
          <Card className="border-blue-100 shadow-xs">
            <CardHeader className="bg-blue-50/40 border-b">
              <CardTitle className="text-base flex items-center gap-2 text-blue-900">
                <Sparkles className="w-5 h-5 text-blue-700" /> Catálogo de Demostración (Ambientes de Prueba y Capacitación)
              </CardTitle>
              <CardDescription>
                Carga automáticamente 12 productos de abarrotes de alta rotación (con códigos de barra reales EAN-13, costos, precios e impuestos), proveedores mayoristas y clientes estándar.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-slate-600 space-y-1">
                <div>• Funciona de forma segura en cualquier ambiente (desarrollo, docker o nube).</div>
                <div>• No altera usuarios ni borra configuraciones preexistentes.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => loadDemoData(false)}
                  disabled={seedingDemo}
                  className="font-bold border-blue-200 text-blue-800 hover:bg-blue-50"
                  data-testid="load-demo-btn"
                >
                  <Sparkles className={`w-4 h-4 mr-1.5 text-blue-700 ${seedingDemo ? "animate-spin" : ""}`} />
                  Cargar / Reponer Demo
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => loadDemoData(true)}
                  disabled={seedingDemo}
                  className="text-xs text-blue-700 hover:bg-blue-100 font-semibold"
                  title="Fuerza la inserción de cualquier producto o contacto faltante"
                >
                  Forzar Regeneración
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Zona de Limpieza para Producción Real */}
          <Card className="border-red-200 bg-red-50/15 shadow-xs">
            <CardHeader className="bg-red-50/60 border-b border-red-100">
              <CardTitle className="text-base flex items-center gap-2 text-red-950">
                <ShieldAlert className="w-5 h-5 text-red-700" /> Puesta en Marcha: Preparar para Producción Real
              </CardTitle>
              <CardDescription className="text-red-900/80">
                Cuando finalices las pruebas o la capacitación del personal, utiliza esta herramienta para purgar los movimientos de prueba antes de abrir la tienda al público real.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Opción 1 */}
                <div className="p-4 rounded-lg border border-slate-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Trash2 className="w-4 h-4 text-amber-700" /> 1. Limpiar Solo Transacciones
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Borra todas las ventas de prueba, recibos, gastos, facturas escaneadas, turnos de caja y nóminas.
                      <strong className="text-slate-700 block mt-1">Conserva intactos: Productos, códigos de barra, precios, categorías y clientes.</strong>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full font-bold border-amber-300 text-amber-900 hover:bg-amber-50"
                    onClick={() => {
                      setWipeScope("transactions_only");
                      setWipeConfirmPhrase("");
                      setWipeDialogOpen(true);
                    }}
                    data-testid="wipe-transactions-btn"
                  >
                    Purgar Solo Movimientos de Prueba
                  </Button>
                </div>

                {/* Opción 2 */}
                <div className="p-4 rounded-lg border border-red-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="font-bold text-sm text-red-900 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-700" /> 2. Limpieza Total a Cero (Clean Slate)
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      Borra todo el historial operativo y también los productos y contactos de muestra. Deja la base de datos completamente en blanco.
                      <strong className="text-red-700 block mt-1">Protección: Usuarios administradores y credenciales nunca se eliminan.</strong>
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full font-bold bg-red-700 hover:bg-red-800 text-white"
                    onClick={() => {
                      setWipeScope("full_clean_slate");
                      setWipeConfirmPhrase("");
                      setWipeDialogOpen(true);
                    }}
                    data-testid="wipe-full-btn"
                  >
                    Limpieza Total a Cero
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* DIÁLOGO DE CONFIRMACIÓN DE LIMPIEZA / VACIADO */}
      <Dialog open={wipeDialogOpen} onOpenChange={setWipeDialogOpen}>
        <DialogContent className="max-w-md border-red-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-950 font-extrabold text-lg">
              <ShieldAlert className="w-5 h-5 text-red-700" /> Confirmación de Seguridad
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-600">
              {wipeScope === "transactions_only"
                ? "Esta acción eliminará de forma permanente todas las ventas, pagos, gastos, facturas escaneadas y turnos de caja registrados. Tus productos y clientes se conservarán."
                : "Esta acción eliminará de forma permanente TODO el catálogo de productos de prueba, contactos y ventas registradas. La base de datos quedará 100% en blanco."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="p-3 bg-red-50 rounded-lg border border-red-200 text-xs text-red-900 font-medium space-y-1">
              <div>⚠️ Esta operación es <strong>irreversible</strong>.</div>
              <div>🔒 Tus usuarios administradores y ajustes de tienda permanecerán seguros.</div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Escribe <span className="text-red-700 font-black">PRODUCCION</span> o <span className="text-red-700 font-black">BORRAR</span> para autorizar:
              </label>
              <Input
                value={wipeConfirmPhrase}
                onChange={(e) => setWipeConfirmPhrase(e.target.value)}
                placeholder="PRODUCCION"
                className="font-mono uppercase tracking-wider text-center font-bold border-red-300 focus-visible:ring-red-500"
                autoFocus
                data-testid="wipe-confirm-input"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setWipeDialogOpen(false)}
              disabled={wiping}
              className="font-semibold"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleWipeData}
              disabled={wiping || !["BORRAR", "PRODUCCION", "PRODUCCIÓN", "RESET", "LIMPIAR"].includes(wipeConfirmPhrase.trim().toUpperCase())}
              className="bg-red-700 hover:bg-red-800 font-bold"
              data-testid="confirm-wipe-btn"
            >
              {wiping ? "Limpiando datos..." : "Confirmar y Purgar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

