import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";

export default function CameraScanner({ open, onOpenChange, onScan }) {
  const [error, setError] = useState("");
  const scannerRef = useRef(null);
  const running = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    let cancelled = false;
    let tries = 0;

    const start = () => {
      if (cancelled) return;
      const el = document.getElementById("camera-reader");
      if (!el) {
        // Radix portal mounts async; retry a few frames
        if (tries++ < 30) return requestAnimationFrame(start);
        return setError("No se pudo inicializar el visor de cámara.");
      }
      try {
        const scanner = new Html5Qrcode("camera-reader", { verbose: false });
        scannerRef.current = scanner;

        const config = {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight);
            return {
              width: Math.max(160, Math.floor(minDim * 0.8)),
              height: Math.max(120, Math.floor(minDim * 0.55)),
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
            setError("No se pudo acceder a la cámara. Asegúrate de otorgar permisos en el navegador y usar HTTPS o localhost. (" + (e?.message || e) + ")");
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
      <DialogContent data-testid="camera-scanner-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="w-5 h-5 text-emerald-700" /> Escanear código de barras</DialogTitle>
          <DialogDescription>Apunta la cámara al código EAN-13, Code-128 o QR del producto.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <div id="camera-reader" className="w-full rounded-lg overflow-hidden bg-black min-h-[260px]" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="w-64 h-36 border-2 border-emerald-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2" data-testid="camera-error">{error}</div>}
        <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-camera-btn"><X className="w-4 h-4 mr-1" /> Cerrar</Button>
      </DialogContent>
    </Dialog>
  );
}
