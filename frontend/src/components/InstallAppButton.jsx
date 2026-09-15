import { useEffect, useState } from "react";
import { Smartphone, Share2, Plus, X } from "lucide-react";

/* Singleton: beforeinstallprompt llega una sola vez por sesión de página. */
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn(false));
  });
}

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

export default function InstallAppButton({ className = "", label = "Instalar app en tu celular" }) {
  const [available, setAvailable] = useState(!!deferredPrompt);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const fn = (v) => setAvailable(v);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  if (!available && !isIos()) return null;
  if (isIos() && window.navigator.standalone) return null; // ya instalada en iOS

  const onClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch { /* noop */ }
      deferredPrompt = null;
      setAvailable(false);
    } else if (isIos()) {
      setIosHelp(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 ${className}`}
        data-testid="install-app-btn"
      >
        <Smartphone className="h-4 w-4" /> {label}
      </button>

      {iosHelp && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setIosHelp(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Instalar en iPhone/iPad</h3>
              <button type="button" onClick={() => setIosHelp(false)} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                Toca el botón <b>Compartir</b> de Safari (cuadrado con flecha hacia arriba).
              </li>
              <li className="flex items-start gap-2">
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                Elige <b>Añadir a pantalla de inicio</b> y confirma con <b>Añadir</b>.
              </li>
            </ol>
            <p className="mt-3 text-xs text-slate-500">La app quedará como un ícono más en tu teléfono, a pantalla completa.</p>
          </div>
        </div>
      )}
    </>
  );
}
