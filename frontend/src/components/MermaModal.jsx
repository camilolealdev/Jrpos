import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";
import { PackageX, Loader2 } from "lucide-react";

// Códigos de motivo estructurados: deben coincidir exactamente con MERMA_REASONS
// en backend/routers/products.py, así el reporte agrupado funciona sin sorpresas.
const MOTIVOS = [
  { value: "vencido", label: "Vencido / caducado" },
  { value: "roto", label: "Roto / dañado" },
  { value: "derramado", label: "Derramado" },
  { value: "robo", label: "Robo" },
  { value: "otro", label: "Otro" },
];

export default function MermaModal({ open, onOpenChange, product, onSaved }) {
  const [qty, setQty] = useState("");
  const [motivo, setMotivo] = useState("vencido");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setQty("");
    setMotivo("vencido");
    setReason("");
  };

  const close = (v) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const qtyNum = Number(qty) || 0;
  const estimatedImpact = product ? qtyNum * (Number(product.cost) || 0) : 0;

  const submit = async () => {
    if (!product?.id) return;
    if (!qtyNum || qtyNum <= 0) return toast.error("Ingresa una cantidad mayor a 0");
    if (qtyNum > Number(product.stock)) return toast.error("La cantidad no puede superar el stock actual");

    setSaving(true);
    try {
      const { data } = await api.post(`/products/${product.id}/merma`, {
        qty: qtyNum,
        motivo,
        reason: reason.trim() || undefined,
      });
      toast.success(`Merma registrada · Impacto: ${formatCOP(data.cost_impact)}`);
      close(false);
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error registrando la merma");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md" data-testid="merma-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="w-5 h-5 text-red-600" /> Registrar merma
          </DialogTitle>
          <DialogDescription>
            {product?.name} · Stock actual: {product?.stock} {product?.unit}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold">Cantidad perdida</label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`Máx. ${product?.stock ?? 0}`}
              data-testid="merma-qty"
            />
          </div>
          <div>
            <label className="text-xs font-semibold">Motivo</label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger data-testid="merma-motivo"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold">Nota (opcional)</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: vitrina 2, lote 445..."
              data-testid="merma-note"
            />
          </div>
          {qtyNum > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-sm" data-testid="merma-impact-preview">
              <span className="text-red-800 font-semibold">
                Impacto de costo estimado: {formatCOP(estimatedImpact)}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>Cancelar</Button>
          <Button
            onClick={submit}
            className="bg-red-600 hover:bg-red-700"
            disabled={saving}
            data-testid="merma-submit-btn"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Registrando...</>
            ) : (
              "Registrar merma"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
