import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function Services() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/products", { params: { limit: 5000 } })
      .then((r) => setItems(Array.isArray(r.data) ? r.data.filter((p) => p && p.is_service) : []))
      .catch(() => setItems([]));
  }, []);

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="services-page">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Wrench className="w-6 h-6 text-emerald-700" /> Prestación de Servicios</h1>
          <p className="text-sm text-slate-500">Productos marcados como "servicio": se venden en el POS sin descontar stock (recargas, giros, copias...).</p>
        </div>
        <Link to="/inventario"><Button variant="outline" data-testid="go-inventory">Crear servicio en Inventario</Button></Link>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Servicios configurados</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b"><tr className="text-left">
              <th className="p-3">Servicio</th><th className="p-3">Categoría</th><th className="p-3 text-right">Precio</th>
            </tr></thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={3} className="p-8 text-center text-slate-400">
                  Sin servicios. Edita un producto en Inventario y marca la casilla "Es servicio".
                </td></tr>
              ) : items.map((p) => (
                <tr key={p.id} className="border-b" data-testid={`service-${p.id}`}>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3"><Badge variant="outline">{p.category}</Badge></td>
                  <td className="p-3 text-right font-mono font-bold">{formatCOP(p.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
