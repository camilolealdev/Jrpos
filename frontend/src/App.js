import { lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";

// Carga perezosa (Code Splitting) para reducir el bundle inicial
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const POS = lazy(() => import("@/pages/POS"));
const Inventory = lazy(() => import("@/pages/Inventory"));
const InvoiceScanner = lazy(() => import("@/pages/InvoiceScanner"));
const Customers = lazy(() => import("@/pages/Customers"));
const Suppliers = lazy(() => import("@/pages/Suppliers"));
const Reports = lazy(() => import("@/pages/Reports"));
const Credits = lazy(() => import("@/pages/Credits"));
const BulkLoad = lazy(() => import("@/pages/BulkLoad"));
const BulkUpdate = lazy(() => import("@/pages/BulkUpdate"));
const Expenses = lazy(() => import("@/pages/Expenses"));
const ElectronicPOS = lazy(() => import("@/pages/ElectronicPOS"));
const Users = lazy(() => import("@/pages/Users"));
const Settings = lazy(() => import("@/pages/Settings"));
const Support = lazy(() => import("@/pages/Support"));
const Timeclock = lazy(() => import("@/pages/Timeclock"));
const CashPickup = lazy(() => import("@/pages/CashPickup"));
const Promotions = lazy(() => import("@/pages/Promotions"));
const SalesDocs = lazy(() => import("@/pages/SalesDocs"));
const Purchases = lazy(() => import("@/pages/Purchases"));
const Dian = lazy(() => import("@/pages/Dian"));
const Commissions = lazy(() => import("@/pages/Commissions"));
const Services = lazy(() => import("@/pages/Services"));
const Placeholder = lazy(() => import("@/pages/Placeholder"));

const soonModules = [];

function PageLoader() {
  return (
    <div className="w-full h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
      <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      <span className="text-xs font-medium">Cargando módulo...</span>
    </div>
  );
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function ProtectedApp() {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-950 text-slate-400 text-sm" data-testid="auth-loading">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <span>Iniciando sesión segura JRPOS...</span>
        </div>
      </div>
    );
  }
  if (user === null) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="inventario" element={<Inventory />} />
          <Route path="facturas" element={<InvoiceScanner />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="proveedores" element={<Suppliers />} />
          <Route path="reportes" element={<Reports />} />
          <Route path="creditos" element={<Credits />} />
          <Route path="carga-masiva" element={<AdminRoute><BulkLoad /></AdminRoute>} />
          <Route path="actualizacion-masiva" element={<AdminRoute><BulkUpdate /></AdminRoute>} />
          <Route path="gastos" element={<Expenses />} />
          <Route path="facturacion-pos-electronica" element={<AdminRoute><ElectronicPOS /></AdminRoute>} />
          <Route path="usuarios" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="configuracion" element={<AdminRoute><Settings /></AdminRoute>} />
          <Route path="soporte" element={<Support />} />
          <Route path="marcacion" element={<Timeclock />} />
          <Route path="recogidas" element={<CashPickup />} />
          <Route path="promociones" element={<AdminRoute><Promotions /></AdminRoute>} />
          <Route path="ordenes-venta" element={<SalesDocs key="cot" defaultTab="cotizaciones" />} />
          <Route path="remisiones" element={<AdminRoute><SalesDocs key="rem" defaultTab="remisiones" /></AdminRoute>} />
          <Route path="cuentas-cobro" element={<AdminRoute><SalesDocs key="cc" defaultTab="cuentas" /></AdminRoute>} />
          <Route path="notas" element={<AdminRoute><SalesDocs key="nc" defaultTab="notas" /></AdminRoute>} />
          <Route path="garantias" element={<SalesDocs key="gar" defaultTab="garantias" />} />
          <Route path="ordenes-compra" element={<Purchases key="oc" defaultTab="oc" />} />
          <Route path="documento-soporte" element={<AdminRoute><Purchases key="ds" defaultTab="ds" /></AdminRoute>} />
          <Route path="facturacion-electronica" element={<AdminRoute><Dian key="fe" defaultTab="fe" /></AdminRoute>} />
          <Route path="nomina-electronica" element={<AdminRoute><Dian key="nom" defaultTab="nomina" /></AdminRoute>} />
          <Route path="radian" element={<AdminRoute><Dian key="rad" defaultTab="radian" /></AdminRoute>} />
          <Route path="certificado-digital" element={<AdminRoute><Dian key="cert" defaultTab="cert" /></AdminRoute>} />
          <Route path="comisiones" element={<AdminRoute><Commissions /></AdminRoute>} />
          <Route path="servicios" element={<Services />} />
          {soonModules.map((m) => (
            <Route key={m.path} path={m.path} element={<Placeholder title={m.title} description={m.desc} />} />
          ))}
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <div className="App">
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Toaster position="top-right" richColors />
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/welcome" element={<Login />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
