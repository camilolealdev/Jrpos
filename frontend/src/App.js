import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import POS from "@/pages/POS";
import Inventory from "@/pages/Inventory";
import InvoiceScanner from "@/pages/InvoiceScanner";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import Reports from "@/pages/Reports";
import Credits from "@/pages/Credits";
import BulkLoad from "@/pages/BulkLoad";
import BulkUpdate from "@/pages/BulkUpdate";
import Expenses from "@/pages/Expenses";
import ElectronicPOS from "@/pages/ElectronicPOS";
import Users from "@/pages/Users";
import Settings from "@/pages/Settings";
import Support from "@/pages/Support";
import Timeclock from "@/pages/Timeclock";
import CashPickup from "@/pages/CashPickup";
import Promotions from "@/pages/Promotions";
import SalesDocs from "@/pages/SalesDocs";
import Purchases from "@/pages/Purchases";
import Dian from "@/pages/Dian";
import Commissions from "@/pages/Commissions";
import Services from "@/pages/Services";
import Placeholder from "@/pages/Placeholder";

const soonModules = [];

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
    return <div className="min-h-screen grid place-items-center text-slate-500" data-testid="auth-loading">Cargando sesión...</div>;
  }
  if (user === null) {
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  }
  return (
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
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
