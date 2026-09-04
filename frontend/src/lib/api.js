import axios from "axios";

// Si REACT_APP_BACKEND_URL no está definido, usar ruta relativa /api para funcionar en Vercel, proxies y desarrollo local
const rawBackendUrl = (process.env.REACT_APP_BACKEND_URL || "").trim();
export const API = rawBackendUrl.replace(/\/$/, "") ? `${rawBackendUrl.replace(/\/$/, "")}/api` : "/api";

export const api = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config || {};
    // Refresh transparente: ante 401 intenta renovar la sesión una sola vez
    if (
      err?.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes("/auth/refresh") &&
      !window.location.pathname.startsWith("/login")
    ) {
      original._retried = true;
      try {
        refreshing = refreshing || axios
          .post(`${API}/auth/refresh`, {}, { withCredentials: true })
          .finally(() => { refreshing = null; });
        await refreshing;
        return api(original); // reintenta la petición original con la cookie renovada
      } catch {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
