// Sistema de sincronización offline con IndexedDB para JRPOS
const DB_NAME = "jrpos_offline_db";
const DB_VERSION = 1;
const STORE_SALES = "sales_queue";
const STORE_PRODUCTS = "cached_products";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SALES)) {
        db.createObjectStore(STORE_SALES, { keyPath: "offline_id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
        db.createObjectStore(STORE_PRODUCTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Guarda productos en caché local para búsqueda offline
export async function cacheProductsOffline(products) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PRODUCTS, "readwrite");
    const store = tx.objectStore(STORE_PRODUCTS);
    for (const p of products) {
      store.put(p);
    }
  } catch (err) {
    console.warn("[offlineSync] Error guardando productos en cache:", err);
  }
}

// Obtiene productos de caché offline
export async function getCachedProductsOffline() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PRODUCTS, "readonly");
      const store = tx.objectStore(STORE_PRODUCTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// Encola una venta realizada sin conexión
export async function queueOfflineSale(saleData) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SALES, "readwrite");
    const store = tx.objectStore(STORE_SALES);
    const item = { ...saleData, created_at: new Date().toISOString(), synced: false };
    return new Promise((resolve, reject) => {
      const req = store.add(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[offlineSync] Error encolando venta offline:", err);
    throw err;
  }
}

// Sincroniza todas las ventas offline pendientes cuando regrese internet
export async function syncOfflineSales(apiClient) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_SALES, "readwrite");
    const store = tx.objectStore(STORE_SALES);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = async () => {
      const pending = getAllReq.result || [];
      if (pending.length === 0) return 0;

      let syncedCount = 0;
      for (const sale of pending) {
        try {
          const { offline_id, ...payload } = sale;
          await apiClient.post("/sales", payload);
          const delTx = db.transaction(STORE_SALES, "readwrite");
          delTx.objectStore(STORE_SALES).delete(offline_id);
          syncedCount++;
        } catch (postErr) {
          console.warn("[offlineSync] Reintento fallido para venta:", sale.offline_id, postErr);
        }
      }
      return syncedCount;
    };
  } catch (err) {
    console.warn("[offlineSync] Error sincronizando ventas offline:", err);
  }
}
