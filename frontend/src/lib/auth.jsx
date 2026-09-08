import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { API } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=cargando, null=no auth, obj=auth

  useEffect(() => {
    let active = true;
    // Timeout de seguridad de 2.5s para evitar quedarse colgado en loading
    axios.get(`${API}/auth/me`, { withCredentials: true, timeout: 2500 })
      .then((r) => {
        if (active) setUser(r.data);
      })
      .catch(async (err) => {
        // Gate de suscripción: trial vencido / tenant suspendido (403) → paywall
        if (err?.response?.status === 403) {
          if (!window.location.pathname.startsWith("/paywall")) {
            window.location.href = "/paywall";
          }
          if (active) setUser(null);
          return;
        }
        // Solo intentar refresh si el error fue específicamente sesión expirada (había token previo)
        const isExpired = err?.response?.data?.detail === "Sesión expirada";
        if (isExpired) {
          try {
            await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true, timeout: 2000 });
            const r = await axios.get(`${API}/auth/me`, { withCredentials: true, timeout: 2000 });
            if (active) {
              setUser(r.data);
              return;
            }
          } catch {
            /* noop */
          }
        }
        if (active) setUser(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password }, { withCredentials: true, timeout: 8000 });
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true, timeout: 4000 });
    } catch {
      /* noop */
    }
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, setUser, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
