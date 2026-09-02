import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, BookOpen, Camera, ShoppingCart, HandCoins, Printer, FileSpreadsheet } from "lucide-react";
import { whatsappUrl } from "@/pages/Credits";

const GUIDES = [
  { icon: ShoppingCart, title: "Vender en el POS", steps: "Busca o escanea el producto (📷 cámara o pistola) → ajusta cantidades → Cobrar → elige método (efectivo, Nequi, transferencia...) → entrega recibo." },
  { icon: HandCoins, title: "Atender varios clientes", steps: "Con un carrito activo toca 'Retener', ponle nombre (Mesa 1, Juan) y atiende al siguiente. Las cuentas abiertas aparecen como chips; tócalas para retomarlas sin mezclarse." },
  { icon: Camera, title: "Cargar factura con foto", steps: "Módulo 'Escanear Factura' → sube la foto de la factura del proveedor → la IA extrae los productos → revisa y confirma: el inventario se actualiza solo." },
  { icon: HandCoins, title: "Fiar y cobrar fiado", steps: "En el POS elige método 'Crédito' y selecciona el cliente. En 'Créditos' ves la cartera, registras abonos y envías recordatorio por WhatsApp." },
  { icon: Printer, title: "Imprimir recibos", steps: "Conecta tu impresora térmica Bluetooth (58/80mm) desde el diálogo de impresión. El ancho se configura en Configuración." },
  { icon: FileSpreadsheet, title: "Carga masiva", steps: "Descarga la plantilla CSV, llénala con tus productos y súbela en 'Carga Masiva'. Para subir precios a toda una categoría usa 'Actualización Masiva'." },
];

export default function Support() {
  const [phone, setPhone] = useState("");
  useEffect(() => { api.get("/settings/general").then((r) => setPhone(r.data.support_phone || "")).catch(() => {}); }, []);

  const wa = whatsappUrl(phone, "Hola, necesito ayuda con JRPOS 🏪");

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-4xl" data-testid="support-page">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><BookOpen className="w-6 h-6 text-emerald-700" /> Soporte y Capacitación</h1>
          <p className="text-sm text-slate-500">Guías rápidas de los módulos activos.</p>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer">
            <Button className="bg-green-600 hover:bg-green-700" data-testid="support-whatsapp-btn">
              <MessageCircle className="w-4 h-4 mr-1" /> Hablar con soporte
            </Button>
          </a>
        )}
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {GUIDES.map((g) => (
          <Card key={g.title} data-testid={`guide-${g.title.replace(/\s/g, "-")}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 grid place-items-center shrink-0"><g.icon className="w-4 h-4" /></span>
                {g.title}
              </CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm text-slate-600 leading-relaxed">{g.steps}</p></CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="p-4 text-sm text-slate-500">
          💡 Tip: repite el tour guiado de los módulos con el botón <b>❓ Guía</b> en la barra superior. El roadmap de módulos futuros está en <code className="font-mono text-xs bg-slate-100 px-1 rounded">docs/MODULOS_PENDIENTES.md</code>.
        </CardContent>
      </Card>
    </div>
  );
}
