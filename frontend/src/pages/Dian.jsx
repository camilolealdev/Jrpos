import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FileText, Award, Upload, Plus, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

export default function Dian({ defaultTab = "fe" }) {
  const [tab, setTab] = useState(defaultTab);
  const [radian, setRadian] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [cert, setCert] = useState({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ employee_name: "", period: new Date().toISOString().slice(0, 7), salary: "", bonuses: 0 });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (tab === "radian") setRadian((await api.get("/radian/invoices")).data);
    if (tab === "nomina") setPayroll((await api.get("/payroll")).data);
    if (tab === "cert") setCert((await api.get("/electronic/certificate")).data);
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  const savePayslip = async () => {
    if (!form.employee_name || !form.salary) return toast.error("Empleado y salario requeridos");
    try {
      await api.post("/payroll", { ...form, salary: Number(form.salary), bonuses: Number(form.bonuses) || 0 });
      toast.success("Nómina generada (simulada)"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error"); }
  };

  const uploadCert = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".p12") && !f.name.endsWith(".pfx")) return toast.error("Debe ser archivo .p12 o .pfx");
    try {
      await api.post("/electronic/certificate", { filename: f.name, size: f.size, expires: "" });
      toast.success("Certificado registrado"); load();
    } catch (err) { toast.error(err?.response?.data?.detail || "Error"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" data-testid="dian-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-emerald-700" /> Facturación Electrónica DIAN</h1>
        <p className="text-sm text-amber-700 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Modo SIMULADO: estructuras de prueba, no válidas ante la DIAN hasta conectar proveedor tecnológico.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="fe" data-testid="tab-fe">Facturación</TabsTrigger>
          <TabsTrigger value="nomina" data-testid="tab-nomina">Nómina Electrónica</TabsTrigger>
          <TabsTrigger value="radian" data-testid="tab-radian">RADIAN</TabsTrigger>
          <TabsTrigger value="cert" data-testid="tab-cert">Certificado Digital</TabsTrigger>
        </TabsList>

        <TabsContent value="fe" className="mt-3">
          <Card><CardContent className="p-6 space-y-3">
            <p className="text-sm text-slate-600">La generación de facturas electrónicas POS se hace desde el módulo <b>POS Electrónica</b> (datos del emisor + XML/CUFE por venta).</p>
            <Link to="/facturacion-pos-electronica"><Button className="bg-emerald-700 hover:bg-emerald-800" data-testid="go-pos-elec">Ir a POS Electrónica</Button></Link>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="nomina" className="mt-3 space-y-3">
          <div className="flex justify-end"><Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setOpen(true)} data-testid="new-payslip-btn"><Plus className="w-4 h-4 mr-1" /> Generar nómina</Button></div>
          <Card><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b"><tr className="text-left">
                <th className="p-3">N°</th><th className="p-3">Empleado</th><th className="p-3">Periodo</th>
                <th className="p-3 text-right">Devengado</th><th className="p-3 text-right">Deducciones</th><th className="p-3 text-right">Neto</th>
              </tr></thead>
              <tbody>
                {payroll.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-slate-400">Sin nóminas.</td></tr>
                : payroll.map((p) => (
                  <tr key={p.id} className="border-b"><td className="p-3 font-mono">{p.number}</td><td className="p-3">{p.employee_name}</td>
                    <td className="p-3 font-mono">{p.period}</td><td className="p-3 text-right font-mono">{formatCOP(p.salary + p.bonuses)}</td>
                    <td className="p-3 text-right font-mono text-orange-700">-{formatCOP(p.deductions)}</td>
                    <td className="p-3 text-right font-mono font-bold text-emerald-700">{formatCOP(p.net)}</td></tr>
                ))}
              </tbody>
            </table>
          </div></CardContent></Card>
        </TabsContent>

        <TabsContent value="radian" className="mt-3">
          <Card>
            <CardHeader><CardTitle className="text-lg">Facturas electrónicas registradas</CardTitle></CardHeader>
            <CardContent className="p-0"><div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b"><tr className="text-left">
                  <th className="p-3">N°</th><th className="p-3">Fecha</th><th className="p-3 text-right">Total</th><th className="p-3">CUFE</th><th className="p-3">Estado</th>
                </tr></thead>
                <tbody>
                  {radian.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-slate-400">Sin facturas electrónicas. Genéralas en POS Electrónica.</td></tr>
                  : radian.map((s) => (
                    <tr key={s.id} className="border-b"><td className="p-3 font-mono">{s.electronic_number || s.number}</td>
                      <td className="p-3">{formatDate(s.created_at)}</td><td className="p-3 text-right font-mono">{formatCOP(s.total)}</td>
                      <td className="p-3 font-mono text-xs max-w-[200px] truncate">{s.cufe}</td>
                      <td className="p-3"><Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">{s.electronic_status}</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            </div></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cert" className="mt-3">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Award className="w-5 h-5" /> Certificado Digital (.p12)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cert.filename ? (
                <div className="border rounded-lg p-4 bg-emerald-50 border-emerald-200 text-sm" data-testid="cert-info">
                  <div className="font-semibold">📜 {cert.filename}</div>
                  <div className="text-slate-600">Subido por {cert.uploaded_by} el {formatDate(cert.uploaded_at)} · {(cert.size / 1024).toFixed(1)} KB</div>
                </div>
              ) : <p className="text-sm text-slate-500">No hay certificado registrado.</p>}
              <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="upload-cert-btn">
                <Upload className="w-4 h-4 mr-1" /> Subir certificado .p12
              </Button>
              <input ref={fileRef} type="file" accept=".p12,.pfx" className="hidden" onChange={uploadCert} data-testid="cert-input" />
              <p className="text-xs text-slate-400">Se guarda la metadata para el modo simulado. La firma real requiere proveedor tecnológico DIAN.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="payslip-form">
          <DialogHeader><DialogTitle>Generar nómina (simulada)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-semibold">Empleado</label>
              <Input value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} data-testid="pay-name" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><label className="text-xs font-semibold">Periodo</label>
                <Input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} /></div>
              <div><label className="text-xs font-semibold">Salario</label>
                <Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="font-mono" data-testid="pay-salary" /></div>
              <div><label className="text-xs font-semibold">Bonificaciones</label>
                <Input type="number" value={form.bonuses} onChange={(e) => setForm({ ...form, bonuses: e.target.value })} className="font-mono" /></div>
            </div>
            <p className="text-xs text-slate-400">Deducciones automáticas: 8% (salud + pensión).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={savePayslip} data-testid="save-payslip-btn">Generar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
