import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Barcode, X } from "lucide-react";

// Max time to wait for the Radix Dialog portal to mount the reader div
const MOUNT_TIMEOUT_MS = 3000;

// Reproducir beep estilo POS al detectar código
const playScanBeep = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1850, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, gain.gain.value);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch { /* noop */ }
};

// Formatos soportados por BarcodeDetector (Chrome/Edge). Si el navegador no
// acepta la lista completa, cae a un detector sin restricción de formatos.
const NATIVE_FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93",
  "itf", "codabar", "qr_code", "pdf417", "aztec", "data_matrix",
];

export default function CameraScanner({ open, onOpenChange, onScan, continuous = false }) {
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [lastCode, setLastCode] = useState("");
  const [flash, setFlash] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const lastScanTimeRef = useRef(0);
  const lastScannedCodeRef = useRef("");
  // Motor activo: "native" (BarcodeDetector) | "zxing" (@zxing/browser)
  const engineRef = useRef(""); // "" | "native" | "zxing"
  const nativeStreamRef = useRef(null);
  const nativeLoopRef = useRef(0);
  const zxingControlsRef = useRef(null);
  const running = useRef(false);
  const rawId = useId();
  const readerId = `camera-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const handleDetectedText = useCallback((text) => {
    if (!text) return;
    const cleanText = String(text).trim();
    if (!cleanText) return;
    const now = performance.now();

    playScanBeep();

    if (continuous) {
      // Cooldown para evitar lecturas duplicadas en ráfaga
      if (cleanText === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1500) {
        return;
      }
      if (now - lastScanTimeRef.current < 600) {
        return;
      }
      lastScanTimeRef.current = now;
      lastScannedCodeRef.current = cleanText;
      setLastCode(cleanText);
      setScannedCount((prev) => prev + 1);
      setFlash(true);
      setTimeout(() => setFlash(false), 350);
      onScan(cleanText);
    } else {
      stopEngine();
      running.current = false;
      onOpenChange(false);
      onScan(cleanText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous, onOpenChange, onScan]);

  const stopNative = () => {
    cancelAnimationFrame(nativeLoopRef.current);
    const stream = nativeStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      nativeStreamRef.current = null;
    }
  };

  const stopEngine = () => {
    stopNative();
    const controls = zxingControlsRef.current;
    if (controls) {
      try { controls.stop(); } catch { /* noop */ }
      zxingControlsRef.current = null;
    }
    running.current = false;
    engineRef.current = "";
  };

  // Capa 1 — BarcodeDetector nativo (Chrome/Edge Android y desktop):
  // decodificación acelerada sin cargar librería JS de decodificación.
  const startNative = async (videoConstraints) => {
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: NATIVE_FORMATS });
    } catch {
      detector = new window.BarcodeDetector();
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    nativeStreamRef.current = stream;
    const holder = document.getElementById(readerId);
    const video = document.createElement("video");
    video.className = "w-full min-h-[280px] object-cover";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    holder.replaceChildren(video);
    await video.play().catch(() => {});
    running.current = true;
    engineRef.current = "native";
    let alive = true;
    const tick = async () => {
      if (!alive || engineRef.current !== "native") return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length) handleDetectedText(codes[0].rawValue);
        } catch { /* frame descartado */ }
      }
      nativeLoopRef.current = requestAnimationFrame(tick);
    };
    nativeLoopRef.current = requestAnimationFrame(tick);
  };

  // Capa 2 — @zxing/browser (MIT + core Apache): fallback JS puro para
  // navegadores sin BarcodeDetector (iOS Safari, Firefox, etc.).
  // Import dinámico: los dispositivos con detección nativa nunca descargan ZXing.
  const startZxing = async (videoConstraints) => {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const holder = document.getElementById(readerId);
    const video = document.createElement("video");
    video.className = "w-full min-h-[280px] object-cover";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    holder.replaceChildren(video);

    const controls = await reader.decodeFromConstraints(
      { video: videoConstraints, audio: false },
      video,
      (result) => {
        if (result) handleDetectedText(result.getText());
      }
    );
    zxingControlsRef.current = controls;
    running.current = true;
    engineRef.current = "zxing";
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
      stopEngine();

      // facingMode → constraints directas; deviceId (string) → constraint exacta
      const videoConstraints =
        camSource && typeof camSource === "object"
          ? camSource
          : { deviceId: { exact: camSource } };

      if ("BarcodeDetector" in window) {
        try {
          await startNative(videoConstraints);
          setStarting(false);
          return;
        } catch {
          // La capa nativa pudo fallar después de tomar la cámara (getUserMedia
          // ya concedido antes de que reventara, ej. holder aún no montado):
          // libera ese stream o la cámara queda encendida mientras zxing pide
          // uno nuevo.
          stopNative();
        }
      }

      await startZxing(videoConstraints);
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
        // Fallback final: constraints genéricas
        try {
          if ("BarcodeDetector" in window) {
            await startNative({ facingMode: "user" });
            setStarting(false);
            return;
          }
          await startZxing({ facingMode: "user" });
          setStarting(false);
          return;
        } catch { /* noop */ }
        setError("No se pudo iniciar la cámara: " + msg);
      }
    } finally {
      setStarting(false);
    }
  };

  // Listado de cámaras sin depender de html5-qrcode: getUserMedia para pedir
  // permiso (los labels solo llegan con permiso concedido) + enumerateDevices.
  const listCameras = async () => {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
      tmp.getTracks().forEach((t) => t.stop());
    } catch { /* el flujo principal maneja el error de permiso */ }
    const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    return devs
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({ id: d.deviceId, label: d.label || "" }))
      .filter((d, i, arr) => d.id && arr.findIndex((x) => x.id === d.id) === i)
      .map((d, i) => ({ ...d, label: d.label || `Cámara ${i + 1}` }));
  };

  useEffect(() => {
    if (!open) {
      stopEngine();
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
        // Arrancar por facingMode: en móviles el label llega vacío hasta que ya
        // se concedió permiso; facingMode deja que el navegador resuelva la
        // cámara trasera de forma nativa.
        await startWithCamera({ facingMode: { ideal: "environment" } });
        if (cancelled) return;

        const devices = await listCameras();
        if (cancelled) return;
        if (devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find((d) => /back|trasera|rear|environment/i.test(d.label));
          setSelectedCamId(backCam ? backCam.id : devices[0].id);
        }
      } catch {
        if (!cancelled) {
          startWithCamera({ facingMode: "user" });
        }
      }
    };

    const raf = requestAnimationFrame(init);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopEngine();
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
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={`relative overflow-hidden rounded-xl bg-slate-950 min-h-[280px] shadow-inner transition-all duration-300 ${flash ? "ring-4 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]" : ""}`}>
          <div id={readerId} className="w-full min-h-[280px] overflow-hidden [&>video]:w-full [&>video]:min-h-[280px] [&>video]:object-cover" />

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

        {/* Consejos de iluminación y distancia */}
        <p className="text-[11px] text-center text-slate-500 dark:text-slate-400">
          💡 <strong>Tip:</strong> Sostén el código firme a unos <strong>15–20 cm</strong> de la cámara con buena iluminación.
        </p>

        {/* Entrada manual de respaldo si la cámara no enfoca */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim()) {
              handleDetectedText(manualCode.trim());
              setManualCode("");
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="O escribe/pega el código aquí..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
            data-testid="manual-barcode-input-dialog"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="text-xs h-auto py-1 px-3 border-emerald-500 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
            disabled={!manualCode.trim()}
          >
            Ingresar
          </Button>
        </form>

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
