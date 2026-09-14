import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Barcode, X, Flashlight, FlashlightOff } from "lucide-react";

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

// Vibración corta al detectar código — feedback táctil en celular, donde el
// beep de audio a menudo pasa desapercibido en un local con ruido ambiente.
const vibrateScan = () => {
  try {
    navigator.vibrate?.(60);
  } catch { /* noop */ }
};

// Formatos soportados por BarcodeDetector (Chrome/Edge). Si el navegador no
// acepta la lista completa, cae a un detector sin restricción de formatos.
const NATIVE_FORMATS = [
  "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "code_93",
  "itf", "codabar", "qr_code", "pdf417", "aztec", "data_matrix",
];

// @zxing/library tiene un bug conocido de bundling: sus propias excepciones
// esperadas (NotFoundException/FormatException/ChecksumException — "no hay
// código en este frame todavía") a veces fallan el chequeo `instanceof`
// interno y la librería las loguea como error inesperado vía
// `console.error("MultiFormatReader: non-ReaderException from reader:", e)`.
// A 30fps eso inunda la consola sin ser un error real (el callback de
// decodeFromConstraints ya descarta `err` intencionalmente). Filtramos solo
// ese mensaje puntual mientras el motor zxing está corriendo.
let zxingConsoleSuppressCount = 0;
const originalConsoleError = console.error.bind(console);
const suppressZxingNoise = () => {
  zxingConsoleSuppressCount += 1;
  if (zxingConsoleSuppressCount > 1) return;
  console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("MultiFormatReader: non-ReaderException")) {
      return;
    }
    originalConsoleError(...args);
  };
};
const restoreZxingNoise = () => {
  zxingConsoleSuppressCount = Math.max(0, zxingConsoleSuppressCount - 1);
  if (zxingConsoleSuppressCount === 0) {
    console.error = originalConsoleError;
  }
};

// `"BarcodeDetector" in window` solo dice que la clase existe, no que el
// navegador tenga un backend de detección funcional instalado (el caso típico
// roto: Chrome de escritorio/Windows). `getSupportedFormats()` es una llamada
// estática — no pide cámara ni permisos — que sí refleja soporte real de la
// plataforma; si devuelve vacío o falla, ni intentamos abrir el motor nativo
// y nos ahorramos pedir la cámara dos veces. Se cachea porque es una
// capacidad fija del navegador durante toda la sesión.
let nativeBarcodeSupportPromise = null;
const isNativeBarcodeDetectorUsable = () => {
  if (!("BarcodeDetector" in window)) return Promise.resolve(false);
  if (!nativeBarcodeSupportPromise) {
    nativeBarcodeSupportPromise = window.BarcodeDetector.getSupportedFormats
      ? window.BarcodeDetector.getSupportedFormats()
          .then((formats) => Array.isArray(formats) && formats.length > 0)
          .catch(() => false)
      : Promise.resolve(true); // navegador viejo sin el método estático: dejamos que el smoke-test de startNative decida
  }
  return nativeBarcodeSupportPromise;
};

export default function CameraScanner({ open, onOpenChange, onScan, continuous = false }) {
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [scannedCount, setScannedCount] = useState(0);
  const [lastCode, setLastCode] = useState("");
  const [flash, setFlash] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  // Espejo reactivo de engineRef — solo para pintar el badge/botón de motor;
  // engineRef sigue siendo la fuente de verdad que leen los loops async.
  const [activeEngine, setActiveEngine] = useState(""); // "" | "native" | "zxing"
  const [noDetectionHint, setNoDetectionHint] = useState(false);
  const lastScanTimeRef = useRef(0);
  const lastScannedCodeRef = useRef("");
  // Motor activo: "native" (BarcodeDetector) | "zxing" (@zxing/browser)
  const engineRef = useRef(""); // "" | "native" | "zxing"
  const nativeStreamRef = useRef(null);
  const nativeLoopRef = useRef(0);
  const zxingControlsRef = useRef(null);
  const running = useRef(false);
  const activeTrackRef = useRef(null);
  const wakeLockRef = useRef(null);
  const rawId = useId();
  const readerId = `camera-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  const handleDetectedText = useCallback((text) => {
    if (!text) return;
    const cleanText = String(text).trim();
    if (!cleanText) return;
    const now = performance.now();

    playScanBeep();
    vibrateScan();

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
      restoreZxingNoise();
    }
    running.current = false;
    engineRef.current = "";
    activeTrackRef.current = null;
    setTorchOn(false);
    setTorchSupported(false);
    setActiveEngine("");
    releaseWakeLock();
  };

  // Mismas constraints que arma startWithCamera, extraídas para que
  // switchEngine() pueda reconstruirlas al forzar un motor manualmente sin
  // duplicar la lógica de resolución ideal / selección de cámara.
  const buildVideoConstraints = (camSource) => ({
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(camSource && typeof camSource === "object"
      ? camSource
      : camSource
        ? { deviceId: { exact: camSource } }
        : { facingMode: { ideal: "environment" } }),
  });

  // Detecta si la cámara activa soporta linterna (torch) — solo Chrome/Android
  // por ahora vía MediaStreamTrack capabilities. Se llama tras arrancar cualquiera
  // de los dos motores, ya que ambos terminan controlando un <video> con un track.
  const detectTorch = () => {
    const holder = document.getElementById(readerId);
    const video = holder?.querySelector("video");
    const track = video?.srcObject?.getVideoTracks?.()[0];
    activeTrackRef.current = track || null;
    try {
      const caps = track?.getCapabilities?.();
      setTorchSupported(!!caps?.torch);
    } catch {
      setTorchSupported(false);
    }
  };

  const toggleTorch = async () => {
    const track = activeTrackRef.current;
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      /* dispositivo no soporta torch en runtime pese a anunciar la capability */
    }
  };

  // Evita que la pantalla del celular se apague en medio de un escaneo continuo
  // de caja (el cajero suele soltar el equipo entre productos).
  const requestWakeLock = async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock?.request?.("screen");
    } catch {
      wakeLockRef.current = null;
    }
  };

  const releaseWakeLock = () => {
    try { wakeLockRef.current?.release?.(); } catch { /* noop */ }
    wakeLockRef.current = null;
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

    // Verificación de humo: en Chrome de escritorio (sobre todo Windows)
    // `BarcodeDetector` puede existir en `window` sin que el backend de
    // detección (un componente descargable de Chrome) esté instalado —
    // `detect()` entonces lanza en CADA frame, y como el loop de abajo
    // descarta esas excepciones en silencio, el escáner queda "vivo" pero
    // nunca detecta nada, sin ningún error visible. Esperamos a que el video
    // tenga un frame real y probamos detect() una vez antes de comprometernos
    // a este motor; si falla, dejamos que el caller haga fallback a zxing.
    for (let i = 0; i < 20 && video.readyState < 2; i++) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (video.readyState >= 2) {
      await detector.detect(video);
    }

    running.current = true;
    engineRef.current = "native";
    setActiveEngine("native");
    console.info(`[CameraScanner] motor nativo (BarcodeDetector) activo — ${navigator.userAgent}`);
    detectTorch();
    requestWakeLock();
    let alive = true;
    // Watchdog: el smoke-test de arriba solo prueba UN frame antes de
    // comprometernos a este motor. Si el backend de detección se cae o
    // deja de responder ya en marcha (visto en algunas builds de Chrome/
    // Windows), detect() empieza a lanzar en TODOS los frames y sin esto
    // el escáner queda mudo para siempre sin avisar. Tras varios fallos
    // seguidos, saltamos a zxing en caliente sin que el usuario tenga que
    // cerrar y reabrir el diálogo.
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_NATIVE_FAILURES = 25;
    const tick = async () => {
      if (!alive || engineRef.current !== "native") return;
      if (video.readyState >= 2) {
        try {
          const codes = await detector.detect(video);
          consecutiveFailures = 0;
          if (codes && codes.length) handleDetectedText(codes[0].rawValue);
        } catch {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_NATIVE_FAILURES) {
            alive = false;
            cancelAnimationFrame(nativeLoopRef.current);
            stopNative();
            if (running.current && engineRef.current === "native") {
              console.info("[CameraScanner] motor nativo dejó de responder en runtime, cambiando a zxing");
              startZxing(videoConstraints).catch(() => {
                setError("No se pudo iniciar ningún motor de escaneo de cámara. Usa el campo manual abajo.");
              });
            }
            return;
          }
        }
      }
      nativeLoopRef.current = requestAnimationFrame(tick);
    };
    nativeLoopRef.current = requestAnimationFrame(tick);
  };

  // Capa 2 — @zxing/browser (MIT + core Apache): fallback JS puro para
  // navegadores sin BarcodeDetector (iOS Safari, Firefox, etc.).
  // Import dinámico: los dispositivos con detección nativa nunca descargan ZXing.
  const startZxing = async (videoConstraints) => {
    const [{ BrowserMultiFormatReader, BarcodeFormat }, { DecodeHintType }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    // Sin esto, MultiFormatReader prueba TODOS los formatos que conoce (incluye
    // RSS/MaxiCode/Micro-QR/extensiones que nunca usamos) en cada frame sin
    // código detectado, y cada sub-decoder que falla imprime su propio error
    // en consola — con la cámara corriendo a 30fps eso inunda la consola en
    // segundos. Restringir a los formatos reales reduce el ruido y acelera
    // cada intento de decodificación.
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF,
      BarcodeFormat.CODABAR, BarcodeFormat.QR_CODE, BarcodeFormat.PDF_417, BarcodeFormat.AZTEC,
      BarcodeFormat.DATA_MATRIX,
    ]);
    // TRY_HARDER activa reintentos adicionales por frame (rotación, mayor
    // esfuerzo en localizar el patrón) — sin esto zxing renuncia demasiado
    // rápido en códigos borrosos o a la distancia típica de un celular.
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const holder = document.getElementById(readerId);
    const video = document.createElement("video");
    video.className = "w-full min-h-[280px] object-cover";
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    holder.replaceChildren(video);

    suppressZxingNoise();
    let controls;
    try {
      controls = await reader.decodeFromConstraints(
        { video: videoConstraints, audio: false },
        video,
        (result, err) => {
          if (result) {
            handleDetectedText(result.getText());
          }
          // err se descarta intencionalmente en cada frame: ZXing arroja NotFoundException
          // continuamente mientras busca un código en el video. No es un error real.
        }
      );
    } catch (err) {
      restoreZxingNoise();
      throw err;
    }
    zxingControlsRef.current = controls;
    running.current = true;
    engineRef.current = "zxing";
    setActiveEngine("zxing");
    console.info(`[CameraScanner] motor zxing (fallback JS) activo — ${navigator.userAgent}`);
    detectTorch();
    requestWakeLock();
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

      // facingMode → constraints directas; deviceId (string) → constraint exacta.
      // Resolución ideal alta: la cámara trasera de un celular suele arrancar en
      // baja resolución por defecto, lo que dificulta leer códigos pequeños o
      // densos (EAN-13 chico, PDF417). Es "ideal", no "exact": si el hardware no
      // llega, el navegador negocia la resolución más cercana sin fallar.
      const videoConstraints = buildVideoConstraints(camSource);

      if (await isNativeBarcodeDetectorUsable()) {
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
        setError("No se detectó ninguna cámara activa o conectada en este dispositivo.");
      } else if (errName === "NotReadableError" || msg.includes("Could not start video source")) {
        setError("La cámara está siendo usada por otra app (Zoom, Meet, otra pestaña con cámara, etc.). Ciérrala y reintenta.");
      } else {
        // Fallback final: constraints genéricas
        try {
          if (await isNativeBarcodeDetectorUsable()) {
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

  // Botón de escape manual: si ninguno de los watchdogs automáticos resolvió
  // el problema (o el usuario simplemente prefiere el otro motor), fuerza el
  // motor contrario sobre la cámara actualmente seleccionada. Al forzar
  // "native" no pasamos por isNativeBarcodeDetectorUsable(): el usuario ya
  // decidió intentarlo, y startNative() igual corre su propio smoke-test.
  const switchEngine = async () => {
    const target = activeEngine === "native" ? "zxing" : "native";
    setError("");
    setStarting(true);
    stopEngine();
    const videoConstraints = buildVideoConstraints(selectedCamId);
    try {
      if (target === "native") {
        await startNative(videoConstraints);
      } else {
        await startZxing(videoConstraints);
      }
    } catch (err) {
      setError(
        target === "native"
          ? "Este dispositivo no tiene un lector de códigos nativo funcional. Sigue con el motor actual o usa el campo manual."
          : "No se pudo iniciar el motor alterno: " + (err?.message || String(err))
      );
    } finally {
      setStarting(false);
    }
  };

  // Aviso pasivo: si el motor lleva activo varios segundos y todavía no
  // detectó nada (ni un primer escaneo en modo ráfaga), asumimos que el
  // usuario puede estar atascado y le mostramos tips + el botón de motor
  // alterno, en vez de dejarlo mirando una cámara "viva" sin feedback.
  useEffect(() => {
    setNoDetectionHint(false);
    if (!activeEngine) return undefined;
    if (continuous && scannedCount > 0) return undefined;
    const timer = setTimeout(() => setNoDetectionHint(true), 8000);
    return () => clearTimeout(timer);
  }, [activeEngine, continuous, scannedCount]);

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

        {/* Motor activo + escape manual — visibilidad de qué está corriendo
            realmente y una salida directa si el motor elegido no detecta,
            sin depender de que el watchdog automático lo resuelva solo. */}
        {activeEngine && (
          <div className="flex items-center justify-between gap-2 bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-lg text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">
              Motor: <strong className="text-slate-700 dark:text-slate-200">{activeEngine === "native" ? "Nativo (rápido)" : "Compatibilidad (zxing)"}</strong>
            </span>
            <button
              type="button"
              onClick={switchEngine}
              disabled={starting}
              data-testid="camera-switch-engine-btn"
              className="text-emerald-700 dark:text-emerald-400 font-semibold hover:underline disabled:opacity-50 disabled:pointer-events-none"
            >
              Probar otro motor
            </button>
          </div>
        )}

        <div className={`relative overflow-hidden rounded-xl bg-slate-950 min-h-[280px] shadow-inner transition-all duration-300 ${flash ? "ring-4 ring-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)]" : ""}`}>
          <div id={readerId} className="w-full min-h-[280px] overflow-hidden [&>video]:w-full [&>video]:min-h-[280px] [&>video]:object-cover" />

          {/* Linterna — solo aparece si la cámara activa la soporta (típicamente
              trasera de un celular Android en Chrome). Botón grande, pensado
              para tocarse con el pulgar sosteniendo el equipo con una mano. */}
          {torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              data-testid="camera-torch-toggle"
              className={`absolute top-2 right-2 z-10 p-2.5 rounded-full border transition-colors ${
                torchOn
                  ? "bg-amber-400 border-amber-300 text-slate-900"
                  : "bg-black/50 border-white/20 text-white hover:bg-black/70"
              }`}
              aria-label={torchOn ? "Apagar linterna" : "Encender linterna"}
              title={torchOn ? "Apagar linterna" : "Encender linterna"}
            >
              {torchOn ? <Flashlight className="w-5 h-5" /> : <FlashlightOff className="w-5 h-5" />}
            </button>
          )}

          {/* Guía visual con recuadro y línea láser animada */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className={`relative w-[70vw] max-w-72 h-44 border-2 rounded-xl transition-all duration-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${flash ? "border-emerald-300 bg-emerald-500/20" : "border-emerald-400/90"}`}>
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

        {/* Aviso si pasaron 8s sin detectar nada — guía al usuario a probar el
            otro motor o el campo manual en vez de quedarse mirando la cámara
            sin saber si algo está fallando. */}
        {noDetectionHint && (
          <p className="text-[11px] text-center text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg py-1.5 px-2">
            ⚠️ No se detecta el código todavía. Prueba <strong>"Probar otro motor"</strong> arriba, acerca/aleja la cámara, o usa el campo manual abajo.
          </p>
        )}

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
