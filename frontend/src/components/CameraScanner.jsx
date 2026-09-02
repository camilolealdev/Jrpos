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
      const scanner = new Html5Qrcode("camera-reader");
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          async (text) => {
            try { await scanner.stop(); } catch { /* noop */ }
            running.current = false;
            onOpenChange(false);
            onScan(text);
          },
          () => {} // per-frame errors ignored
        )
        .then(() => { running.current = true; })
        .catch((e) => {
          setError("No se pudo acceder a la cámara. Revisa permisos o usa HTTPS. " + (e?.message || e));
        });
    };
    const raf = requestAnimationFrame(start);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (running.current && scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        running.current = false;
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
