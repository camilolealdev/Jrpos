import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BUSINESS_TYPES } from "@/lib/businessTypes";

export default function BusinessTypeModal({ open, onSelect, saving }) {
  const [selected, setSelected] = useState(null);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-lg [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">¿Qué tipo de negocio tienes?</DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Con esto ajustamos qué módulos ves en el menú lateral. Puedes cambiarlo luego desde Configuración.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 py-2">
          {BUSINESS_TYPES.map((bt) => (
            <button
              key={bt.id}
              type="button"
              disabled={saving}
              onClick={() => {
                setSelected(bt.id);
                onSelect(bt.id);
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-4 text-sm font-semibold transition-colors",
                selected === bt.id
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50 text-slate-700",
                saving && "opacity-60 pointer-events-none"
              )}
              data-testid={`business-type-${bt.id}`}
            >
              <bt.icon className="w-7 h-7" />
              {bt.label}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
