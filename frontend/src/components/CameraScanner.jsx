import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Barcode, X } from "lucide-react";

// Max time to wait for the Radix Dialog portal to mount the reader div
// (and for it to acquire a non-zero size) before giving up.
const MOUNT_TIMEOUT_MS = 3000;

// Todos los formatos de códigos de barra 1D y códigos 2D/QR soportados
const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
];

export default function CameraScanner({ open, onOpenChange, onScan, continuous = false }) {
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [lastCode, setLastCode] = useState("");
  const [flash, setFlash] = useState(false);
  const [starting, setStarting] = useState(false);
  const lastScanTimeRef = useRef(0);
  const lastScannedCodeRef = useRef("");
  const scannerRef = useRef(null);
  const running = useRef(false);
  const rawId = useId();
  const readerId = `camera-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const handleDetectedText = useCallback((text) => {
    if (!text) return;
    const now = performance.now();

    if (continuous) {
      // Cooldown para evitar lecturas duplicadas en ráfaga
      if (text === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1600) {
        return;
      }
      if (now - lastScanTimeRef.current < 700) {
        return;
      }
      lastScanTimeRef.current = now;
      lastScannedCodeRef.current = text;
      setLastCode(text);
      setScannedCount((prev) => prev + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      onScan(text);
    } else {
      try {
        if (scannerRef.current && running.current) {
          scannerRef.current.stop().catch(() => {});
        }
      } catch { /* noop */ }
      running.current = false;
      onOpenChange(false);
      onScan(text);
    }
  }, [continuous, onOpenChange, onScan]);

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (running.current) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch { /* noop */ }
      running.current = false;
      scannerRef.current = null;
    }
  };

  const startWithCamera = async (camSource) => {
    if (!open) return;
    setError("");
    setStarting(true);

    const el = document.getElementById(readerId);
    if (!el) {
      setStarting(false);
      return;
    }

    try {
      await stopScanner();

      const scanner = new Html5Qrcode(readerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      });
      scannerRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          const boxWidth = Math.min(Math.floor(viewfinderWidth * 0.88), 320);
          const boxHeight = Math.min(Math.floor(minDim * 0.72), 220);
          return {
            width: Math.max(200, boxWidth),
            height: Math.max(140, boxHeight),
          };
        },
      };

      await scanner.start(
        camSource,
        config,
        (text) => handleDetectedText(text),
        () => {} // frame ignored
      );
      running.current = true;
    } catch (err) {
      const errName = err?.name || "";
      const msg = err?.message || String(err);
      if (errName === "NotAllowedError" || msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
        setError("Permiso de cámara denegado. Haz clic en el candado 🔒 junto a la URL en tu navegador y activa 'Permitir cámara'.");
      } else if (errName === "NotFoundError" || msg.includes("Requested device not found")) {
        setError("No se detectó ninguna cámara activa o conectada en tu PC.");
      } else if (errName === "NotReadableError" || msg.includes("Could not start video source")) {
        setError("La cámara está siendo usada por otra aplicación (Zoom, Meet, Teams, etc.). Ciérrala y reintenta.");
      } else {
        // Si falló con ID específico, intentar con constraints genéricas
        if (typeof camSource === "string") {
          try {
            const scanner = new Html5Qrcode(readerId, { formatsToSupport: SUPPORTED_FORMATS, verbose: false });
            scannerRef.current = scanner;
            await scanner.start({ facingMode: "user" }, { fps: 15 }, (t) => handleDetectedText(t), () => {});
            running.current = true;
            setError("");
            setStarting(false);
            return;
          } catch { /* noop */ }
        }
        setError("No se pudo iniciar la cámara: " + msg);
      }
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
      setScannedCount(0);
      setLastCode("");
      lastScannedCodeRef.current = "";
      setCameras([]);
      return;
    }

    let cancelled = false;
    const startedAt = performance.now();

    const init = async () => {
      const el = document.getElementById(readerId);
      const hasSize = el && el.offsetWidth > 0 && el.offsetHeight > 0;
      if (!el || !hasSize) {
        if (performance.now() - startedAt < MOUNT_TIMEOUT_MS && !cancelled) {
          return requestAnimationFrame(init);
        }
      }

      if (!window.isSecureContext || typeof navigator?.mediaDevices?.getUserMedia !== "function") {
        setError(
          "El acceso a la cámara requiere una conexión segura (HTTPS) o 'localhost'. " +
          "Verifica que estés usando https:// o localhost en tu navegador."
        );
        return;
      }

      try {
        // Enlistar todas las cámaras disponibles en PC / Móvil
        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (cancelled) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Preferir cámara trasera en móviles si existe, o la primera encontrada en PC
          const backCam = devices.find((d) =>
            /back|trasera|rear|environment/i.test(d.label || "")
          );
          const defaultId = backCam ? backCam.id : devices[0].id;
          setSelectedCamId(defaultId);
          startWithCamera(defaultId);
        } else {
          // Fallback a facingMode ideal para móviles con drivers restrictivos
          startWithCamera({ facingMode: { ideal: "environment" } });
        }
      } catch (e) {
        if (!cancelled) {
          startWithCamera({ facingMode: "user" });
        }
      }
    };

    const raf = requestAnimationFrame(init);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCameraChange = (e) => {
    const newId = e.target.value;
    setSelectedCamId(newId);
    if (newId) {
      startWithCamera(newId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="camera-scanner-dialog" className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                <Barcode className="w-5 h-5" />
              </div>
              <span>{continuous ? "Escaneo Continuo POS" : "Escanear Código"}</span>
            </DialogTitle>
            {continuous && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                ⚡ Modo Ráfaga
              </span>
            )}
          </div>
          <DialogDescription>
            {continuous
              ? "Pasa los productos uno tras otro frente a la cámara sin cerrar la ventana."
              : "Alinea el código dentro del recuadro para lectura automática."}
          </DialogDescription>
        </DialogHeader>

        {/* Selector de cámara en caso de múltiples cámaras en PC / Laptop */}
        {cameras.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-xs">
            <Camera className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="font-semibold shrink-0">Cámara:</span>
            <select
              value={selectedCamId}
              onChange={handleCameraChange}
              className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {cameras.map((c, idx) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Cámara ${idx + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={`relative overflow-hidden rounded-xl bg-slate-950 min-h-[280px] shadow-inner transition-all duration-300 ${flash ? "ring-4 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]" : ""}`}>
          <div id={readerId} className="w-full min-h-[280px] overflow-hidden" />

          {/* Guía visual con recuadro y línea láser animada */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className={`relative w-72 h-44 border-2 rounded-xl transition-all duration-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${flash ? "border-emerald-300 bg-emerald-500/20" : "border-emerald-400/90"}`}>
              {/* Esquinas destacadas */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-300" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-300" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-300" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-300" />

              {/* Línea guía central (láser de escaneo) */}
              <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" />
            </div>
          </div>

          {/* Feedback de escaneo en modo continuo */}
          {continuous && lastCode && (
            <div className="absolute bottom-2 left-2 right-2 bg-slate-900/90 backdrop-blur border border-emerald-500/50 rounded-lg py-1.5 px-3 flex items-center justify-between text-xs text-white">
              <span className="text-emerald-400 font-medium truncate">Último: {lastCode}</span>
              <span className="font-bold bg-emerald-600 px-1.5 py-0.5 rounded text-[11px]">{scannedCount} items</span>
            </div>
          )}
        </div>

        {/* Formatos admitidos */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">EAN-13 / 8</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">UPC-A / E</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">Code 128 / 39</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">QR Code</span>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-1" data-testid="camera-error">
            <div className="font-semibold flex items-center gap-1.5">
              <span>⚠️ Atención:</span>
            </div>
            <div>{error}</div>
          </div>
        )}

        <Button
          variant={continuous ? "default" : "outline"}
          onClick={() => onOpenChange(false)}
          data-testid="close-camera-btn"
          className={`w-full font-semibold ${continuous ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow-md shadow-emerald-900/40" : ""}`}
        >
          <X className="w-4 h-4 mr-1.5" />
          {continuous && scannedCount > 0
            ? `Listo (${scannedCount} producto${scannedCount === 1 ? "" : "s"} escaneado${scannedCount === 1 ? "" : "s"})`
            : "Cerrar Escáner"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
