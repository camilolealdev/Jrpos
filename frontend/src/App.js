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
import Placeholder from "@/pages/Placeholder";

const soonModules = [
  { path: "facturacion-electronica", title: "Facturación Electrónica", desc: "Emisión DIAN con proveedor tecnológico." },
  { path: "remisiones", title: "Remisiones", desc: "Traslados y notas de entrega." },
  { path: "nomina-electronica", title: "Nómina Electrónica", desc: "Emisión de soportes de nómina DIAN." },
  { path: "documento-soporte", title: "Documento Soporte Electrónico", desc: "Compras a no obligados." },
  { path: "radian", title: "Radian", desc: "Registro y circulación de facturas electrónicas." },
  { path: "promociones", title: "Promociones y Descuentos", desc: "Ofertas, combos y cupones." },
  { path: "ordenes-venta", title: "Órdenes de Venta y Cotizaciones", desc: "Cotiza y confirma pedidos." },
  { path: "garantias", title: "Garantías y Devoluciones", desc: "Casos y reversos de venta." },
  { path: "ordenes-compra", title: "Órdenes de Compra", desc: "Solicitudes a proveedores." },
  { path: "notas", title: "Notas Crédito y Débito", desc: "Ajustes documentales electrónicos." },
  { path: "cuentas-cobro", title: "Cuentas de Cobro", desc: "Documentos equivalentes." },
  { path: "servicios", title: "Prestación de Servicios", desc: "Ventas de servicios facturables." },
  { path: "recogidas", title: "Recogidas de Dinero", desc: "Retiros y arqueos de caja." },
  { path: "comisiones", title: "Comisiones por Productos", desc: "Reglas de comisión por vendedor." },
  { path: "certificado-digital", title: "Certificado Digital", desc: "Instalación .p12 para DIAN." },
];

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
        <Route path="carga-masiva" element={<BulkLoad />} />
        <Route path="actualizacion-masiva" element={<BulkUpdate />} />
        <Route path="gastos" element={<Expenses />} />
        <Route path="facturacion-pos-electronica" element={<ElectronicPOS />} />
        <Route path="usuarios" element={<Users />} />
        <Route path="configuracion" element={<Settings />} />
        <Route path="soporte" element={<Support />} />
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
