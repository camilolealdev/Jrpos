import { useEffect, useId, useRef, useState } from "react";
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

export default function CameraScanner({ open, onOpenChange, onScan }) {
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const running = useRef(false);
  const rawId = useId();
  // useId() output (e.g. ":r0:") is technically valid for getElementById, but
  // sanitize it anyway to avoid any edge cases with colons in CSS/DOM tooling.
  const readerId = `camera-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  useEffect(() => {
    if (!open) return;
    setError("");
    let cancelled = false;
    const startedAt = performance.now();

    const start = () => {
      if (cancelled) return;

      const el = document.getElementById(readerId);
      const hasSize = el && el.offsetWidth > 0 && el.offsetHeight > 0;
      if (!el || !hasSize) {
        // Radix portal mounts async and animates in; retry until it has a
        // real, non-zero-sized element, but bail out after a wall-clock
        // timeout instead of a fixed frame count (slow/low-refresh devices).
        if (performance.now() - startedAt < MOUNT_TIMEOUT_MS) {
          return requestAnimationFrame(start);
        }
        return setError("No se pudo inicializar el visor de cámara.");
      }

      if (!window.isSecureContext || typeof navigator?.mediaDevices?.getUserMedia !== "function") {
        setError(
          "El acceso a la cámara requiere una conexión segura (HTTPS) o \"localhost\". " +
          "Esta página se está cargando por una conexión insegura, por lo que el navegador no permite usar la cámara."
        );
        return;
      }

      try {
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
            const boxWidth = Math.min(Math.floor(viewfinderWidth * 0.85), 320);
            const boxHeight = Math.min(Math.floor(minDim * 0.7), 220);
            return {
              width: Math.max(200, boxWidth),
              height: Math.max(140, boxHeight),
            };
          },
        };

        scanner
          .start(
            { facingMode: { ideal: "environment" } },
            config,
            async (text) => {
              try {
                if (scannerRef.current) {
                  await scannerRef.current.stop();
                }
              } catch { /* noop */ }
              running.current = false;
              onOpenChange(false);
              onScan(text);
            },
            () => {} // per-frame scan failures ignored
          )
          .then(() => { running.current = true; })
          .catch((e) => {
            // Intento de fallback a cámara frontal/default si la trasera falla (ej: laptops/desktops)
            return scanner.start(
              { facingMode: "user" },
              config,
              async (text) => {
                try {
                  if (scannerRef.current) {
                    await scannerRef.current.stop();
                  }
                } catch { /* noop */ }
                running.current = false;
                onOpenChange(false);
                onScan(text);
              },
              () => {}
            ).then(() => { running.current = true; })
            .catch(() => {
              setError("No se pudo acceder a la cámara. Asegúrate de otorgar permisos en el navegador y usar HTTPS o localhost. (" + (e?.message || e) + ")");
            });
          });
      } catch (err) {
        setError("Error inicializando el escáner: " + (err?.message || err));
      }
    };
    const raf = requestAnimationFrame(start);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (scannerRef.current) {
        try {
          if (running.current) {
            scannerRef.current.stop().catch(() => {});
          }
          scannerRef.current.clear().catch(() => {});
        } catch { /* noop */ }
        running.current = false;
        scannerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="camera-scanner-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <Barcode className="w-5 h-5" />
            </div>
            <span>Escanear Código de Barras / QR</span>
          </DialogTitle>
          <DialogDescription>
            Alinea el código dentro del recuadro para lectura automática.
          </DialogDescription>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-xl bg-slate-950 min-h-[280px] shadow-inner">
          <div id={readerId} className="w-full min-h-[280px] overflow-hidden" />
          
          {/* Guía visual con recuadro y línea láser animada */}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative w-72 h-44 border-2 border-emerald-400/90 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {/* Esquinas destacadas */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-300" />
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-300" />
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-300" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-300" />
              
              {/* Línea guía central (láser de escaneo) */}
              <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.9)] animate-pulse" />
            </div>
          </div>
        </div>

        {/* Formatos admitidos */}
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground pt-1">
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">EAN-13 / 8</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">UPC-A / E</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">Code 128 / 39</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 font-mono">QR Code</span>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5" data-testid="camera-error">
            {error}
          </div>
        )}

        <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-camera-btn" className="w-full">
          <X className="w-4 h-4 mr-1.5" /> Cerrar Escáner
        </Button>
      </DialogContent>
    </Dialog>
  );
}
