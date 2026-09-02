import { driver } from "driver.js";
import "driver.js/dist/driver.css";

export const startOnboarding = () => {
  const d = driver({
    showProgress: true,
    nextBtnText: "Siguiente →",
    prevBtnText: "← Atrás",
    doneBtnText: "¡Listo!",
    progressText: "{{current}} de {{total}}",
    steps: [
      {
        popover: {
          title: "👋 Bienvenido a JRPOS",
          description: "Este recorrido te muestra los módulos activos de tu tienda. Toma 1 minuto.",
        },
      },
      {
        element: '[data-testid="nav-dashboard"]',
        popover: { title: "Panel", description: "Ventas de hoy, top productos y alertas de stock bajo de un vistazo." },
      },
      {
        element: '[data-testid="nav-pos"]',
        popover: { title: "POS Venta", description: "Tu caja registradora: busca o escanea (📷 cámara o pistola), cobra en efectivo/Nequi/transferencia, retiene cuentas para atender varios clientes a la vez e imprime el recibo térmico." },
      },
      {
        element: '[data-testid="nav-facturas"]',
        popover: { title: "Escanear Factura (IA)", description: "Tómale foto a la factura de tu proveedor y la IA extrae los productos para llenar el inventario. También puedes digitarla manual." },
      },
      {
        element: '[data-testid="nav-inventario"]',
        popover: { title: "Inventario", description: "Crea y edita productos, precios, stock y personaliza los iconos de categorías." },
      },
      {
        element: '[data-testid="nav-carga-masiva"]',
        popover: { title: "Carga Masiva", description: "Sube un CSV y crea cientos de productos de una sola vez." },
      },
      {
        element: '[data-testid="nav-act-masiva"]',
        popover: { title: "Actualización Masiva", description: "Sube precios un 10%, ajusta IVA o suma stock a toda una categoría en segundos." },
      },
      {
        element: '[data-testid="nav-clientes"]',
        popover: { title: "Clientes", description: "Tu base de clientes del barrio, necesaria para el fiado." },
      },
      {
        element: '[data-testid="nav-proveedores"]',
        popover: { title: "Proveedores", description: "Quiénes te surten; se crean automáticos al importar facturas escaneadas." },
      },
      {
        element: '[data-testid="nav-creditos"]',
        popover: { title: "Créditos (Fiado)", description: "Cartera por cliente, estado de cuenta y registro de abonos con impresión de recibo." },
      },
      {
        element: '[data-testid="nav-reportes"]',
        popover: { title: "Reportes", description: "Historial de ventas con reimpresión térmica de cualquier factura pasada." },
      },
      {
        element: '[data-testid="nav-gastos"]',
        popover: { title: "Gastos y Pagos", description: "Registra arriendo, servicios y egresos para conocer tu ganancia real." },
      },
      {
        element: '[data-testid="nav-pos-electronica"]',
        popover: { title: "POS Electrónica", description: "Genera CUFE y XML simulados de práctica. Cuando tengas proveedor DIAN, se conecta aquí." },
      },
      {
        popover: {
          title: "🎉 ¡Listo para vender!",
          description: "Empieza cargando tus productos (Inventario o Carga Masiva) y abre el POS. Puedes repetir esta guía desde el botón ❓ arriba a la derecha.",
        },
      },
    ],
  });
  d.drive();
};

export const ONBOARDING_KEY = "jrpos_onboarding_done";
