import { useEffect, useState } from "react";
import axios from "axios";
import { API, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle,
  BookOpen,
  Camera,
  ShoppingCart,
  HandCoins,
  Printer,
  FileSpreadsheet,
  LifeBuoy,
  PlusCircle,
  Clock,
  CheckCircle2,
  X,
  Send,
} from "lucide-react";
import { whatsappUrl } from "@/lib/format";

const GUIDES = [
  {
    icon: ShoppingCart,
    title: "Vender en el POS",
    steps:
      "Busca o escanea el producto (📷 cámara o pistola) → ajusta cantidades → Cobrar → elige método (efectivo, Nequi, transferencia...) → entrega recibo.",
  },
  {
    icon: HandCoins,
    title: "Atender varios clientes",
    steps:
      "Con un carrito activo toca 'Retener', ponle nombre (Mesa 1, Juan) y atiende al siguiente. Las cuentas abiertas aparecen como chips; tócalas para retomarlas sin mezclarse.",
  },
  {
    icon: Camera,
    title: "Cargar factura con foto",
    steps:
      "Módulo 'Escanear Factura' → sube la foto de la factura del proveedor → la IA extrae los productos → revisa y confirma: el inventario se actualiza solo.",
  },
  {
    icon: HandCoins,
    title: "Fiar y cobrar fiado",
    steps:
      "En el POS elige método 'Crédito' y selecciona el cliente. En 'Créditos' ves la cartera, registras abonos y envías recordatorio por WhatsApp.",
  },
  {
    icon: Printer,
    title: "Imprimir recibos",
    steps:
      "Conecta tu impresora térmica Bluetooth (58/80mm) desde el diálogo de impresión. El ancho se configura en Configuración.",
  },
  {
    icon: FileSpreadsheet,
    title: "Carga masiva",
    steps:
      "Descarga la plantilla CSV, llénala con tus productos y súbela en 'Carga Masiva'. Para subir precios a toda una categoría usa 'Actualización Masiva'.",
  },
];

export default function Support() {
  const { user } = useAuth();
  const [phone, setPhone] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("media");
  const [contactPhone, setContactPhone] = useState("");

  const loadTickets = async () => {
    setLoadingTickets(true);
    try {
      const { data } = await axios.get(`${API}/support/tickets`, { withCredentials: true });
      setTickets(data || []);
    } catch (err) {
      console.error("Error loading support tickets", err);
    } finally {
      setLoadingTickets(false);
    }
  };

  useEffect(() => {
    api.get("/settings/general")
      .then((r) => setPhone(r.data.support_phone || "3505954438"))
      .catch(() => setPhone("3505954438"));
    loadTickets();
  }, []);

  const wa = whatsappUrl(phone || "3505954438", "Hola, necesito ayuda con mi tienda en JRPOS 🏪");

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      alert("Por favor completa el asunto y la descripción de tu consulta.");
      return;
    }

    setSubmitting(true);
    try {
      await axios.post(
        `${API}/support/tickets`,
        {
          subject: subject.trim(),
          message: message.trim(),
          priority,
          user_phone: contactPhone.trim() || undefined,
        },
        { withCredentials: true }
      );
      setSubject("");
      setMessage("");
      setPriority("media");
      setShowNewTicketModal(false);
      await loadTickets();
      alert("¡Ticket creado con éxito! Nuestro equipo de soporte lo revisará de inmediato.");
    } catch (err) {
      alert("Error al enviar el ticket de soporte.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl" data-testid="support-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 text-slate-100 font-['Outfit']">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            <span>Soporte y Capacitación</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Mesa de ayuda, tickets directos y guías de uso rápido de JRPOS.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowNewTicketModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs gap-1.5 font-semibold shadow-md"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Crear Ticket de Soporte</span>
          </Button>

          {wa && (
            <a href={wa} target="_blank" rel="noreferrer">
              <Button
                variant="outline"
                className="bg-green-600/20 hover:bg-green-600/30 text-green-300 border-green-500/30 text-xs gap-1.5"
                data-testid="support-whatsapp-btn"
              >
                <MessageCircle className="w-4 h-4 text-green-400" />
                <span>WhatsApp Soporte</span>
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Mis Tickets Activos */}
      {tickets.length > 0 && (
        <Card className="bg-slate-900/60 border-white/10 backdrop-blur-md">
          <CardHeader className="pb-3 border-b border-white/5">
            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
              <LifeBuoy className="w-4 h-4 text-emerald-400" />
              <span>Mis Tickets de Soporte ({tickets.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tickets.map((tk) => (
                <div
                  key={tk.id}
                  className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/10 space-y-2 text-xs"
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-white text-sm">{tk.subject}</span>
                    <Badge
                      className={`text-[10px] capitalize ${
                        tk.status === "abierto"
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                          : tk.status === "en_proceso"
                          ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                          : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      }`}
                    >
                      {tk.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="text-slate-300 bg-black/20 p-2 rounded-xl text-[11px] leading-relaxed">
                    {tk.message}
                  </p>
                  {tk.admin_notes && (
                    <div className="text-[11px] text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 p-2 rounded-xl">
                      <span className="font-semibold">Respuesta del Equipo:</span> {tk.admin_notes}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 flex justify-between pt-1">
                    <span>Prioridad: {tk.priority}</span>
                    <span>{tk.created_at ? new Date(tk.created_at).toLocaleDateString("es-CO") : ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Guías Rápidas */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Guías Rápidas de Operación
        </h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {GUIDES.map((g) => (
            <Card
              key={g.title}
              data-testid={`guide-${g.title.replace(/\s/g, "-")}`}
              className="bg-slate-900/60 border-white/10 backdrop-blur-md hover:border-white/20 transition-all"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2.5 text-white">
                  <span className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 grid place-items-center shrink-0">
                    <g.icon className="w-4 h-4" />
                  </span>
                  <span>{g.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-400 leading-relaxed">{g.steps}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tip Card */}
      <Card className="bg-emerald-950/20 border-emerald-500/20">
        <CardContent className="p-4 text-xs text-slate-300 flex items-center gap-2">
          <span>💡</span>
          <span>
            <b>Tip:</b> Si necesitas soporte urgente o configuración remota de tu impresora térmica, presiona el botón <b>WhatsApp Soporte</b> arriba para atención en vivo.
          </span>
        </CardContent>
      </Card>

      {/* MODAL CREAR TICKET */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white font-['Outfit'] flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-emerald-400" />
                  <span>Crear Ticket de Soporte Técnico</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Describe tu duda o problema y te responderemos lo más pronto posible.
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setShowNewTicketModal(false)}
                className="text-slate-400 hover:text-white rounded-full w-8 h-8"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmitTicket} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Asunto *</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ej: Ayuda para vincular impresora Bluetooth"
                  className="bg-slate-950 border-white/10 text-xs text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Prioridad</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full h-9 bg-slate-950 border border-white/10 rounded-xl px-3 text-xs text-white"
                  >
                    <option value="baja">Baja (Duda general)</option>
                    <option value="media">Media (Operación)</option>
                    <option value="alta">Alta (Bloqueo parcial)</option>
                    <option value="urgente">Urgente (Caja detenida)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Teléfono WhatsApp</label>
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="300 123 4567"
                    className="bg-slate-950 border-white/10 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">Descripción del Problema o Duda *</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Cuéntanos con detalle qué sucede o qué módulo necesitas configurar..."
                  rows={4}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewTicketModal(false)}
                  className="text-xs bg-white/5 border-white/10 text-slate-300"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? "Enviando..." : "Enviar Ticket"}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
