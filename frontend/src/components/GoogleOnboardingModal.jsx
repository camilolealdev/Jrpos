import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Store, User, Phone, ShoppingBag } from "lucide-react";

export default function GoogleOnboardingModal({ open, google, saving, error, onSubmit }) {
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState(google?.name || "");
  const [phone, setPhone] = useState("");
  const [businessType, setBusinessType] = useState("abarrotes");

  const submit = (e) => {
    e.preventDefault();
    onSubmit({ business_name: businessName, name, phone, business_type: businessType });
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-md [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Un último paso, {google?.name?.split(" ")[0] || ""}</DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Con tu cuenta de Google ({google?.email}) aún necesitamos crear tu tienda.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-emerald-600" />
              <span>Nombre de tu Negocio o Tienda *</span>
            </label>
            <Input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
              autoFocus
              placeholder="Ej: Minimercado El Triunfo"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tu Nombre Completo *</span>
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Celular / WhatsApp *</span>
            </label>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="300 123 4567"
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tipo de Comercio</span>
            </label>
            <select
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              disabled={saving}
              className="w-full border border-slate-200 rounded-md px-3 h-10 text-sm focus:outline-none focus:border-emerald-500"
            >
              <option value="abarrotes">Tienda de Abarrotes / Minimercado</option>
              <option value="drogueria">Droguería / Farmacia</option>
              <option value="licorera">Licorera / Bar / Estanco</option>
              <option value="ferreteria">Ferretería / Materiales</option>
              <option value="cafeteria">Cafetería / Panadería / Restaurante</option>
              <option value="ropa">Boutique / Ropa y Calzado</option>
              <option value="otro">Otro Comercio Minorista</option>
            </select>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md p-3 text-center">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full h-11 font-bold" disabled={saving}>
            {saving ? "Creando tu tienda..." : "Crear mi Tienda"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
