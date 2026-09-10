import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { History, ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react";

const TYPE_LABELS = {
  sale: "Venta",
  purchase: "Compra",
  adjustment: "Ajuste",
  return: "Devolución",
  waste: "Merma",
};

export default function KardexModal({ open, onOpenChange, product }) {
  const [loading, setLoading] = useState(false);
  const [movements, setMovements] = useState([]);

  useEffect(() => {
    if (!open || !product?.id) return;
    setLoading(true);
    api.get(`/products/${product.id}/stock-movements`)
      .then((r) => setMovements(Array.isArray(r.data) ? r.data : []))
      .catch(() => setMovements([]))
      .finally(() => setLoading(false));
  }, [open, product?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" data-testid="kardex-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-700" /> Kardex de {product?.name}
          </DialogTitle>
          <DialogDescription>Historial de movimientos de stock de este producto.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : movements.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">Sin movimientos registrados todavía.</div>
        ) : (
          <div className="space-y-1.5">
            {movements.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm border-b pb-1.5" data-testid={`kardex-row-${m.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  {m.qty >= 0 ? (
                    <ArrowUpCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <ArrowDownCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{TYPE_LABELS[m.type] || m.type}{m.reason ? ` · ${m.reason}` : ""}</div>
                    <div className="text-xs text-slate-500">{formatDate(m.created_at)}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-mono font-semibold ${m.qty >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {m.qty >= 0 ? "+" : ""}{m.qty}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">{m.previous_stock} → {m.new_stock}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
