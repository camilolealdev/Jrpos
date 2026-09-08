import { useState, useCallback } from "react";
import axios from "axios";
import { API } from "@/lib/api";

// Flujo compartido de login/registro con Google entre Login.jsx y
// RegisterTenant.jsx: si el correo de Google ya tiene cuenta, entra directo;
// si es nuevo, guarda el credential y abre el modal de onboarding para
// completar los datos de la tienda antes de crear el tenant.
export function useGoogleAuthFlow({ setUser, navigate }) {
  const [credential, setCredential] = useState(null);
  const [googleInfo, setGoogleInfo] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleGoogleCredential = useCallback(
    async (cred) => {
      setError("");
      try {
        const { data } = await axios.post(`${API}/auth/google`, { credential: cred }, { withCredentials: true, timeout: 10000 });
        if (data.needs_onboarding) {
          setCredential(cred);
          setGoogleInfo(data.google);
          setModalOpen(true);
          return;
        }
        setUser(data);
        navigate("/dashboard");
      } catch (err) {
        const d = err?.response?.data?.detail;
        setError(typeof d === "string" ? d : "No se pudo continuar con Google. Intenta de nuevo.");
      }
    },
    [setUser, navigate]
  );

  const handleOnboardingSubmit = useCallback(
    async (fields) => {
      setSaving(true);
      setError("");
      try {
        const { data } = await axios.post(
          `${API}/auth/google`,
          { credential, ...fields },
          { withCredentials: true, timeout: 10000 }
        );
        setUser(data.user);
        navigate("/dashboard");
      } catch (err) {
        const d = err?.response?.data?.detail;
        setError(typeof d === "string" ? d : "Error al crear tu tienda. Verifica los datos.");
      } finally {
        setSaving(false);
      }
    },
    [credential, setUser, navigate]
  );

  return {
    handleGoogleCredential,
    error,
    onboardingModalProps: {
      open: modalOpen,
      google: googleInfo,
      saving,
      error,
      onSubmit: handleOnboardingSubmit,
    },
  };
}
