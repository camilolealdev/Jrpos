#!/usr/bin/env python3
"""Compara modelos de vision para el OCR de facturas con TUS facturas reales.

Uso (desde la raiz del repo, con las API keys en el entorno):
  python scripts/ocr_benchmark.py facturas/ \
    --candidate gemini,gemini-2.5-flash,,GEMINI_API_KEY \
    --candidate openai,gpt-5-mini,https://api.openai.com/v1,OPENAI_API_KEY \
    --candidate groq,meta-llama/llama-4-scout-17b-16e-instruct,https://api.groq.com/openai/v1,GROQ_API_KEY \
    --candidate openrouter,google/gemini-2.5-flash,https://openrouter.ai/api/v1,OPENROUTER_API_KEY

--candidate = tipo,modelo,base_url,VARIABLE_DE_ENTORNO_CON_LA_KEY   (tipo: gemini | openai-compatible, cualquier otro = openai-compatible)
La carpeta tiene fotos (jpg/png/webp). Si junto a una foto hay <foto>.json con la verdad
({"total":..., "supplier_nit":"...", "items":[...]}), se mide exactitud; si no, se usa una
verificacion de consistencia interna (la suma de lineas ~ total de la factura).
Reutiliza el mismo prompt y las mismas funciones que /api/invoices/ocr.
"""
import argparse
import asyncio
import base64
import json
import mimetypes
import os
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from routers import invoices as inv  # noqa: E402


def _consistent(parsed: dict) -> bool:
    items = parsed.get("items") or []
    total = float(parsed.get("total") or 0)
    if not items or total <= 0:
        return False
    line_sum = sum(float(i.get("total") or 0) for i in items)
    sub_tax = float(parsed.get("subtotal") or 0) + float(parsed.get("tax") or 0)
    # la suma de lineas debe aproximar el total o el subtotal (facturas con/sin IVA por linea)
    return any(ref > 0 and abs(line_sum - ref) / ref <= 0.02 for ref in (total, float(parsed.get("subtotal") or 0), sub_tax))


async def _run_one(cand: dict, img_path: Path, timeout: float) -> dict:
    raw = img_path.read_bytes()
    mime = mimetypes.guess_type(img_path.name)[0] or "image/jpeg"
    uri = f"data:{mime};base64,{base64.b64encode(raw).decode()}"
    key = os.environ.get(cand["env"], "")
    t0 = time.monotonic()
    try:
        if cand["type"] == "gemini":
            coro = inv._call_gemini_vision(raw, mime, cand["model"], key)
        else:
            coro = inv._call_openai_compatible_vision(cand["base_url"], cand["model"], key, uri)
        text = await asyncio.wait_for(coro, timeout=timeout)
        err = None
    except Exception as e:  # noqa: BLE001
        text, err = "", f"{type(e).__name__}: {e}"[:120]
    dt = time.monotonic() - t0
    parsed = inv._extract_json(text)
    res = {"seconds": dt, "valid": bool(parsed.get("items")), "consistent": _consistent(parsed) if parsed else False, "error": err,
           "items": len(parsed.get("items") or [])}
    truth_file = img_path.with_suffix(".json")
    if truth_file.exists() and parsed:
        truth = json.loads(truth_file.read_text(encoding="utf-8"))
        res["total_ok"] = abs(float(parsed.get("total") or 0) - float(truth.get("total") or -1)) < 1
        res["items_ok"] = len(parsed.get("items") or []) == len(truth.get("items") or [None])
        res["nit_ok"] = str(parsed.get("supplier_nit") or "") == str(truth.get("supplier_nit") or "")
    return res


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--candidate", action="append", required=True)
    ap.add_argument("--timeout", type=float, default=60)
    args = ap.parse_args()
    cands = []
    for spec in args.candidate:
        t, model, base, env = (spec.split(",") + ["", "", "", ""])[:4]
        cands.append({"type": "gemini" if t == "gemini" else "openai", "name": f"{t}:{model}", "model": model, "base_url": base, "env": env})
    images = sorted(p for p in Path(args.folder).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"))
    if not images:
        sys.exit("No hay imagenes en la carpeta")
    print(f"{len(images)} facturas x {len(cands)} modelos\n")
    print(f"{'modelo':58} {'JSON ok':>8} {'consist.':>9} {'p50 s':>6} {'p90 s':>6} {'exactitud':>10}")
    for c in cands:
        if not os.environ.get(c["env"]):
            print(f"{c['name']:58} (sin {c['env']})")
            continue
        rs = [await _run_one(c, p, args.timeout) for p in images]
        secs = sorted(r["seconds"] for r in rs)
        truth = [r for r in rs if "total_ok" in r]
        acc = f"{sum(r['total_ok'] and r['items_ok'] for r in truth)}/{len(truth)}" if truth else "n/a"
        p90 = secs[min(len(secs) - 1, int(len(secs) * 0.9))]
        print(f"{c['name']:58} {sum(r['valid'] for r in rs):>3}/{len(rs):<4} {sum(r['consistent'] for r in rs):>4}/{len(rs):<4} "
              f"{statistics.median(secs):>6.1f} {p90:>6.1f} {acc:>10}")
        for r in rs:
            if r["error"]:
                print(f"    error: {r['error']}")
                break


if __name__ == "__main__":
    asyncio.run(main())
