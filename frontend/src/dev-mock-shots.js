// TEMPORAL — solo para capturar screenshots reales de la UI sin backend.
// Se activa con ?mockshots en la URL. Eliminar este archivo y su import en index.js al terminar.
import axios from "axios";
import { api } from "@/lib/api";

const MOCK_USER = { id: "u1", name: "Camila Rodríguez", email: "camila@minimarketprogreso.co", role: "admin" };

const MOCK_SETTINGS = { store_name: "Minimarket El Progreso", accent: "emerald" };

const CATEGORIES = [
  { name: "Bebidas", emoji: "🥤" },
  { name: "Abarrotes", emoji: "🌾" },
  { name: "Lácteos", emoji: "🥛" },
  { name: "Aseo del Hogar", emoji: "🧼" },
  { name: "Snacks", emoji: "🥨" },
  { name: "Panadería", emoji: "🥖" },
  { name: "Aseo Personal", emoji: "🧴" },
  { name: "Licores", emoji: "🍺" },
];

const PRODUCTS = [
  { id: "p1", name: "Coca-Cola 400ml", barcode: "7702090029013", price: 3200, cost: 2100, stock: 48, unit: "und", category: "Bebidas", tax_rate: 19 },
  { id: "p2", name: "Agua Cristal 600ml", barcode: "7702090011346", price: 2000, cost: 1200, stock: 62, unit: "und", category: "Bebidas", tax_rate: 19 },
  { id: "p3", name: "Jugo Hit Naranja 200ml", barcode: "7702090055364", price: 1800, cost: 1150, stock: 5, unit: "und", category: "Bebidas", tax_rate: 19 },
  { id: "p4", name: "Cerveza Águila 330ml", barcode: "7702090100323", price: 3500, cost: 2450, stock: 36, unit: "und", category: "Licores", tax_rate: 19 },
  { id: "p5", name: "Arroz Diana x500g", barcode: "7702001003457", price: 2600, cost: 1900, stock: 4, unit: "und", category: "Abarrotes", tax_rate: 0 },
  { id: "p6", name: "Aceite Girasol Premier 1L", barcode: "7702001112456", price: 12900, cost: 10200, stock: 18, unit: "und", category: "Abarrotes", tax_rate: 0 },
  { id: "p7", name: "Frijol Cargamanto x500g", barcode: "7702001225478", price: 4300, cost: 3300, stock: 22, unit: "und", category: "Abarrotes", tax_rate: 0 },
  { id: "p8", name: "Leche Alquería Entera 1L", barcode: "7702870004521", price: 4200, cost: 3400, stock: 3, unit: "und", category: "Lácteos", tax_rate: 0 },
  { id: "p9", name: "Yogurt Alpina Mora 200g", barcode: "7702870017453", price: 2300, cost: 1650, stock: 27, unit: "und", category: "Lácteos", tax_rate: 19 },
  { id: "p10", name: "Queso Campesino x250g", barcode: "7702870098765", price: 6800, cost: 5100, stock: 14, unit: "und", category: "Lácteos", tax_rate: 0 },
  { id: "p11", name: "Detergente Fab x1000g", barcode: "7702123456781", price: 9900, cost: 7600, stock: 20, unit: "und", category: "Aseo del Hogar", tax_rate: 19 },
  { id: "p12", name: "Jabón Rey x300g", barcode: "7702123456798", price: 2400, cost: 1700, stock: 40, unit: "und", category: "Aseo del Hogar", tax_rate: 19 },
  { id: "p13", name: "Papas Margarita 30g", barcode: "7702345600123", price: 1900, cost: 1250, stock: 55, unit: "und", category: "Snacks", tax_rate: 19 },
  { id: "p14", name: "Chocolatina Jet x18g", barcode: "7702345678911", price: 1200, cost: 800, stock: 90, unit: "und", category: "Snacks", tax_rate: 19 },
  { id: "p15", name: "Galletas Ducales x6", barcode: "7702345699812", price: 2100, cost: 1500, stock: 33, unit: "und", category: "Snacks", tax_rate: 19 },
  { id: "p16", name: "Pan Tajado Bimbo x550g", barcode: "7702456123456", price: 6500, cost: 5000, stock: 2, unit: "und", category: "Panadería", tax_rate: 0 },
  { id: "p17", name: "Arepa Blanca x5", barcode: "7702456123890", price: 3800, cost: 2700, stock: 16, unit: "paq", category: "Panadería", tax_rate: 0 },
  { id: "p18", name: "Shampoo Head&Shoulders 375ml", barcode: "7702567891234", price: 15900, cost: 12300, stock: 9, unit: "und", category: "Aseo Personal", tax_rate: 19 },
  { id: "p19", name: "Crema Dental Colgate 90ml", barcode: "7702567891241", price: 5200, cost: 3900, stock: 24, unit: "und", category: "Aseo Personal", tax_rate: 19 },
  { id: "p20", name: "Desodorante Rexona 150ml", barcode: "7702567891258", price: 8700, cost: 6600, stock: 17, unit: "und", category: "Aseo Personal", tax_rate: 19 },
];

const CUSTOMERS = [
  { id: "c1", name: "Don Alberto Ruiz" },
  { id: "c2", name: "Marta Gómez" },
  { id: "c3", name: "Familia Torres" },
  { id: "c4", name: "Cliente Mostrador" },
];

const CREDITS_SUMMARY = {
  total_due: 187400,
  customers: [
    { customer_id: "c1", customer_name: "Don Alberto Ruiz", sales_count: 4, oldest_date: "2026-08-14T10:00:00Z", total_due: 68200 },
    { customer_id: "c2", customer_name: "Marta Gómez", sales_count: 2, oldest_date: "2026-08-22T14:00:00Z", total_due: 41500 },
    { customer_id: "c3", customer_name: "Familia Torres", sales_count: 3, oldest_date: "2026-08-30T09:30:00Z", total_due: 77700 },
  ],
};

const REPORTS_SUMMARY = {
  todays_sales: 1284600,
  todays_count: 47,
  products_count: 312,
  low_stock_count: 6,
  daily_sales: [
    { date: "01 Sep", total: 980000 },
    { date: "02 Sep", total: 1120000 },
    { date: "03 Sep", total: 860000 },
    { date: "04 Sep", total: 1340000 },
    { date: "05 Sep", total: 1050000 },
    { date: "06 Sep", total: 1284600 },
  ],
  top_products: [
    { name: "Coca-Cola 400ml", qty: 86 },
    { name: "Cerveza Águila 330ml", qty: 64 },
    { name: "Chocolatina Jet x18g", qty: 58 },
    { name: "Papas Margarita 30g", qty: 51 },
    { name: "Arepa Blanca x5", qty: 40 },
  ],
  low_stock: [
    { id: "p16", name: "Pan Tajado Bimbo x550g", stock: 2 },
    { id: "p8", name: "Leche Alquería Entera 1L", stock: 3 },
    { id: "p3", name: "Jugo Hit Naranja 200ml", stock: 5 },
    { id: "p5", name: "Arroz Diana x500g", stock: 4 },
  ],
};

function endsWith(url, suffix) {
  return url.split("?")[0].endsWith(suffix);
}

function makeMockAdapter() {
  return function mockAdapter(config) {
    const url = config.url || "";
    const method = (config.method || "get").toLowerCase();
    const ok = (data) => Promise.resolve({ data, status: 200, statusText: "OK", headers: {}, config });
    const fail = () => Promise.reject(Object.assign(new Error("mock-404"), { config, isMock: true }));

    if (endsWith(url, "/auth/me")) return ok(MOCK_USER);
    if (endsWith(url, "/auth/refresh")) return ok({});
    if (endsWith(url, "/settings/general")) return ok(MOCK_SETTINGS);
    if (endsWith(url, "/reports/summary")) return ok(REPORTS_SUMMARY);
    if (endsWith(url, "/credits/summary")) return ok(CREDITS_SUMMARY);
    if (/\/credits\/customer\//.test(url)) return ok({ customer: CUSTOMERS[0], sales: [] });
    if (endsWith(url, "/categories")) return ok(CATEGORIES);
    if (endsWith(url, "/contacts") && method === "get") return ok(CUSTOMERS);
    if (endsWith(url, "/promotions/active")) return ok([]);
    if (endsWith(url, "/held")) return ok([]);
    if (endsWith(url, "/products") && method === "get") return ok(PRODUCTS);
    return fail();
  };
}

export function installMockShotsIfRequested() {
  if (typeof window === "undefined") return;
  if (!window.location.search.includes("mockshots")) return;
  const adapter = makeMockAdapter();
  axios.defaults.adapter = adapter;
  api.defaults.adapter = adapter;
  // eslint-disable-next-line no-console
  console.info("[dev-mock-shots] Mock API adapter instalado para capturas de pantalla.");
}
