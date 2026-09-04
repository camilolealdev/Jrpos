import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clock, LogIn, LogOut, Save, CalendarDays } from "lucide-react";

const fmtTime = (iso) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Timeclock() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [marks, setMarks] = useState([]);
  const [sched, setSched] = useState({ entry_time: "08:00", exit_time: "18:00", tolerance_minutes: 10 });
  const [records, setRecords] = useState(null);
  const [recDate, setRecDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([api.get("/timeclock/today"), api.get("/timeclock/schedule")]);
      setMarks(Array.isArray(m.data) ? m.data : []);
      if (s.data && typeof s.data === "object") setSched(s.data);
    } catch {
      setMarks([]);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    if (user?.role !== "admin") return;
    try {
      const { data } = await api.get("/timeclock/records", { params: { date: recDate } });
      setRecords(data && typeof data === "object" ? data : { employees: [] });
    } catch {
      setRecords({ employees: [] });
    }
  }, [recDate, user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const safeMarks = Array.isArray(marks) ? marks : [];
  const lastType = safeMarks.length ? safeMarks[safeMarks.length - 1]?.type : "out";

  const mark = async (type) => {
    try {
      const { data } = await api.post("/timeclock/mark", { type });
      toast.success(`${type === "in" ? "Entrada" : "Salida"} marcada a las ${fmtTime(data.created_at)}${data.late ? " (tarde)" : ""}`);
      load(); loadRecords();
    } catch (e) { toast.error(e?.response?.data?.detail || "Error marcando"); }
  };

  const saveSched = async () => {
    try {
      await api.put("/timeclock/schedule", { ...sched, tolerance_minutes: Number(sched.tolerance_minutes) });
      toast.success("Horario programado");
    } catch { toast.error("Error guardando horario"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-3xl" data-testid="timeclock-page">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2"><Clock className="w-6 h-6 text-emerald-700" /> Marcación</h1>
        <p className="text-sm text-slate-500">Registra tu entrada y salida. Horario: {sched.entry_time} – {sched.exit_time} (tolerancia {sched.tolerance_minutes} min).</p>
      </div>

      <Card>
        <CardContent className="p-6 text-center space-y-4">
          <div className="font-mono text-5xl font-bold tracking-tight" data-testid="clock-display">
            {now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-sm text-slate-500">{now.toLocaleDateString("es-CO", { dateStyle: "full" })} · {user?.name}</div>
          <div className="flex justify-center gap-3">
            <Button
              className="h-14 px-8 text-lg bg-emerald-700 hover:bg-emerald-800"
              onClick={() => mark("in")}
              disabled={lastType === "in"}
              data-testid="mark-in-btn"
            >
              <LogIn className="w-5 h-5 mr-2" /> Marcar Entrada
            </Button>
            <Button
              className="h-14 px-8 text-lg bg-orange-600 hover:bg-orange-700"
              onClick={() => mark("out")}
              disabled={lastType === "out"}
              data-testid="mark-out-btn"
            >
              <LogOut className="w-5 h-5 mr-2" /> Marcar Salida
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Mis marcas de hoy</CardTitle></CardHeader>
        <CardContent>
          {safeMarks.length === 0 ? (
            <p className="text-sm text-slate-400">Sin marcas hoy.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {safeMarks.map((m) => (
                <Badge key={m.id || Math.random()} variant="outline" className={m.type === "in" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-orange-50 text-orange-800 border-orange-200"} data-testid={`mark-${m.id}`}>
                  {m.type === "in" ? "➜ Entrada" : "⬅ Salida"} {fmtTime(m.created_at)}
                  {m.late && <span className="ml-1 text-red-600 font-bold">· tarde</span>}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {user?.role === "admin" && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-lg">Programación del horario (admin)</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 items-end">
              <div><label className="text-xs font-semibold">Hora entrada</label>
                <Input type="time" value={sched.entry_time} onChange={(e) => setSched({ ...sched, entry_time: e.target.value })} data-testid="sched-entry" /></div>
              <div><label className="text-xs font-semibold">Hora salida</label>
                <Input type="time" value={sched.exit_time} onChange={(e) => setSched({ ...sched, exit_time: e.target.value })} data-testid="sched-exit" /></div>
              <div><label className="text-xs font-semibold">Tolerancia (min)</label>
                <Input type="number" value={sched.tolerance_minutes} onChange={(e) => setSched({ ...sched, tolerance_minutes: e.target.value })} data-testid="sched-tolerance" /></div>
              <Button className="bg-emerald-700 hover:bg-emerald-800 col-span-3 sm:col-span-1" onClick={saveSched} data-testid="save-schedule-btn"><Save className="w-4 h-4 mr-1" /> Guardar</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="w-5 h-5" /> Marcas del equipo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input type="date" value={recDate} onChange={(e) => setRecDate(e.target.value)} className="w-48" data-testid="records-date" />
              {!records || !Array.isArray(records.employees) || records.employees.length === 0 ? (
                <p className="text-sm text-slate-400">Sin marcas en esta fecha.</p>
              ) : records.employees.map((emp) => (
                <div key={emp.name || Math.random()} className="border rounded-lg p-3" data-testid={`emp-${emp.name}`}>
                  <div className="font-semibold text-sm mb-1.5">{emp.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(emp.marks) ? emp.marks : []).map((m) => (
                      <Badge key={m.id || Math.random()} variant="outline" className={m.type === "in" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-orange-50 text-orange-800 border-orange-200"}>
                        {m.type === "in" ? "➜" : "⬅"} {fmtTime(m.created_at)}
                        {m.late && <span className="ml-1 text-red-600 font-bold">· tarde</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
