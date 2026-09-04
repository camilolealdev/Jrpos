import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck, UserCog } from "lucide-react";

const empty = { name: "", email: "", password: "", role: "cajero" };

export default function Users() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/users");
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const safeItems = Array.isArray(items) ? items : [];

  if (user && user.role !== "admin") {
    return <div className="p-8 text-center text-slate-500" data-testid="users-denied">Solo administradores pueden gestionar usuarios.</div>;
  }

  const save = async () => {
    if (!form.name || !form.email || !form.password) return toast.error("Completa todos los campos");
    try {
      await api.post("/users", form);
      toast.success(`Usuario ${form.name} creado`);
      setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };
  const remove = async (id) => {
    if (!window.confirm("¿Eliminar usuario?")) return;
    try { await api.delete(`/users/${id}`); toast.success("Eliminado"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  return (
    <div className="p-4 lg:p-6" data-testid="users-page">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><UserCog className="w-6 h-6 text-emerald-700" /> Permisos de Usuarios</h1>
          <p className="text-sm text-slate-500">Roles: <b>admin</b> (todo) · <b>cajero</b> (POS, clientes, créditos, reportes).</p>
        </div>
        <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-user-btn"><Plus className="w-4 h-4 mr-1" /> Nuevo usuario</Button>
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b"><tr className="text-left">
            <th className="p-3">Nombre</th><th className="p-3">Correo</th><th className="p-3">Rol</th><th></th>
          </tr></thead>
          <tbody>
            {safeItems.map((u) => (
              <tr key={u.id} className="border-b hover:bg-slate-50" data-testid={`user-row-${u.id}`}>
                <td className="p-3 font-medium">{u.name}</td>
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <Badge variant="outline" className={u.role === "admin" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : ""}>
                    {u.role === "admin" && <ShieldCheck className="w-3 h-3 mr-1" />}{u.role}
                  </Badge>
                </td>
                <td className="p-3 text-right">
                  {user?.id !== u.id && (
                    <Button size="icon" variant="ghost" onClick={() => remove(u.id)} data-testid={`del-user-${u.id}`}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="user-form">
          <DialogHeader><DialogTitle>Nuevo usuario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold">Nombre</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="u-name" /></div>
            <div><label className="text-xs font-semibold">Correo</label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="u-email" /></div>
            <div><label className="text-xs font-semibold">Contraseña</label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="u-password" /></div>
            <div><label className="text-xs font-semibold">Rol</label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="u-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cajero">Cajero</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={save} data-testid="save-user-btn">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
