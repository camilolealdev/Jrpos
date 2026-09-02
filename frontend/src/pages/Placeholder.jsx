import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Placeholder({ title, description }) {
  return (
    <div className="p-6 lg:p-10" data-testid="placeholder-page">
      <Card className="max-w-2xl">
        <CardContent className="p-8 space-y-4">
          <div className="w-12 h-12 rounded-lg bg-amber-100 text-amber-700 grid place-items-center">
            <Rocket className="w-6 h-6" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          <p className="text-slate-600">{description}</p>
          <p className="text-sm text-slate-500">
            Este módulo forma parte del plan completo del sistema JRPOS. Ya tienes disponibles: POS, Inventario, Escaneo de Facturas con IA, Clientes/Proveedores y Reportes.
            <br />Este módulo se habilitará en las siguientes fases.
          </p>
          <div className="flex gap-2">
            <Link to="/dashboard"><Button variant="outline">Volver al panel</Button></Link>
            <Link to="/pos"><Button className="bg-emerald-700 hover:bg-emerald-800"><Sparkles className="w-4 h-4 mr-1" /> Ir al POS</Button></Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
