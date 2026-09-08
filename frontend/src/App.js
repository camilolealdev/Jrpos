import { lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import logoWhite from "@/assets/logo2.webp";

// Carga perezosa con auto-recuperación ante nuevos despliegues (evita ChunkLoadError)
const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    try {
      return await componentImport();
    } catch (error) {
      const isRefreshed = sessionStorage.getItem("jrpos_chunk_refreshed") === "true";
      if (!isRefreshed) {
        sessionStorage.setItem("jrpos_chunk_refreshed", "true");
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem("jrpos_chunk_refreshed");
      throw error;
    }
  });

const Login = lazyWithRetry(() => import("@/pages/Login"));
const RegisterTenant = lazyWithRetry(() => import("@/pages/RegisterTenant"));
const Dashboard = lazyWithRetry(() => import("@/pages/Dashboard"));
const POS = lazyWithRetry(() => import("@/pages/POS"));
const Inventory = lazyWithRetry(() => import("@/pages/Inventory"));
const InvoiceScanner = lazyWithRetry(() => import("@/pages/InvoiceScanner"));
const Customers = lazyWithRetry(() => import("@/pages/Customers"));
const Suppliers = lazyWithRetry(() => import("@/pages/Suppliers"));
const Reports = lazyWithRetry(() => import("@/pages/Reports"));
const Credits = lazyWithRetry(() => import("@/pages/Credits"));
const BulkLoad = lazyWithRetry(() => import("@/pages/BulkLoad"));
const BulkUpdate = lazyWithRetry(() => import("@/pages/BulkUpdate"));
const Expenses = lazyWithRetry(() => import("@/pages/Expenses"));
const ElectronicPOS = lazyWithRetry(() => import("@/pages/ElectronicPOS"));
const Users = lazyWithRetry(() => import("@/pages/Users"));
const Settings = lazyWithRetry(() => import("@/pages/Settings"));
const Support = lazyWithRetry(() => import("@/pages/Support"));
const Timeclock = lazyWithRetry(() => import("@/pages/Timeclock"));
const CashPickup = lazyWithRetry(() => import("@/pages/CashPickup"));
const Promotions = lazyWithRetry(() => import("@/pages/Promotions"));
const SalesDocs = lazyWithRetry(() => import("@/pages/SalesDocs"));
const Purchases = lazyWithRetry(() => import("@/pages/Purchases"));
const Dian = lazyWithRetry(() => import("@/pages/Dian"));
const Commissions = lazyWithRetry(() => import("@/pages/Commissions"));
const Services = lazyWithRetry(() => import("@/pages/Services"));
const SuperAdmin = lazyWithRetry(() => import("@/pages/SuperAdmin"));
const Placeholder = lazyWithRetry(() => import("@/pages/Placeholder"));

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
  if (user?.role !== "admin" && user?.role !== "superadmin_platform") {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

function ProtectedApp() {
  const { user } = useAuth();
  const loc = useLocation();
  if (user === undefined) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#07100c] text-slate-400 text-sm" data-testid="auth-loading">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.05] p-2 flex items-center justify-center border border-white/10 shadow-2xl backdrop-blur-md">
            <img src={logoWhite} alt="JRPOS" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-3.5 h-3.5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <span>Iniciando sesión segura...</span>
          </div>
        </div>
      </div>
    );
  }
  if (user === null) {
    const dest = loc.pathname === "/" || loc.pathname === "/welcome" ? "/welcome" : "/login";
    return <Navigate to={dest} state={{ from: loc.pathname }} replace />;
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
          <Route path="superadmin" element={<AdminRoute><SuperAdmin /></AdminRoute>} />
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
            <Route path="/registro" element={<RegisterTenant />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
