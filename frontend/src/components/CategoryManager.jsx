import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { categoryIcon } from "@/lib/categoryIcons";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pin, PinOff, Save } from "lucide-react";
import { toast } from "sonner";

export default function CategoryManager({ open, onOpenChange, onSaved }) {
  const [cats, setCats] = useState([]);
  const load = async () => {
    const { data } = await api.get("/categories");
    setCats(data);
  };
  useEffect(() => { if (open) load(); }, [open]);

  const save = async (c, changes) => {
    try {
      await api.put("/categories/meta", { name: c.name, ...changes });
      await load();
      onSaved && onSaved();
    } catch { toast.error("No se pudo guardar"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" data-testid="category-manager">
        <DialogHeader>
          <DialogTitle>Iconos y orden de categorías</DialogTitle>
          <DialogDescription>Cambia el emoji y fija tus favoritas al inicio del POS.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {cats.map((c, idx) => (
            <div key={c.name} className="flex items-center gap-2 p-2 border rounded-lg bg-slate-50" data-testid={`catmeta-${c.name}`}>
              <div className="text-2xl w-10 text-center">{c.emoji || categoryIcon(c.name)}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{c.name}</div>
                <div className="text-xs text-slate-500">{c.count} productos</div>
              </div>
              <Input
                defaultValue={c.emoji || ""}
                placeholder="🛒"
                maxLength={4}
                className="w-16 text-center text-lg"
                data-testid={`emoji-${c.name}`}
                onBlur={(e) => e.target.value !== (c.emoji || "") && save(c, { emoji: e.target.value || " " })}
              />
              <Button
                size="icon"
                variant={c.pinned ? "default" : "outline"}
                className={c.pinned ? "bg-amber-500 hover:bg-amber-600" : ""}
                onClick={() => save(c, { pinned: !c.pinned, order: c.pinned ? 999 : idx })}
                data-testid={`pin-${c.name}`}
                title={c.pinned ? "Desfijar" : "Fijar al inicio"}
              >
                {c.pinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
              </Button>
              {c.pinned && (
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => save(c, { order: Math.max(0, (c.order || 0) - 1) })}>▲</Button>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => save(c, { order: (c.order || 0) + 1 })}>▼</Button>
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="bg-emerald-700 hover:bg-emerald-800"><Save className="w-4 h-4 mr-1" /> Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
