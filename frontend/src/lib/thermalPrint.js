// Web Bluetooth ESC/POS thermal printer helper (58mm=32 chars, 80mm=48 chars).
// Compatible con impresoras Bluetooth genéricas BLE que exponen servicio 000018f0-0000-1000-8000-00805f9b34fb.
const SERVICE_UUID = 0x18f0;
const CHAR_UUID = 0x2af1;

const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

const enc = new TextEncoder();
const bytes = (arr) => new Uint8Array(arr);

function line(text = "", width = 32) {
  const t = text.length > width ? text.slice(0, width) : text.padEnd(width, " ");
  return enc.encode(t + "\n");
}
function twoCol(left, right, width = 32) {
  const space = Math.max(1, width - left.length - right.length);
  return enc.encode((left + " ".repeat(space) + right).slice(0, width) + "\n");
}
function concat(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function printThermal({ title, subtitle, meta = [], items = [], totals = [], footer = "¡Gracias por su compra!", width = 32 }) {
  if (!navigator.bluetooth) throw new Error("Este navegador no soporta Bluetooth. Usa Chrome/Edge Android.");
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }],
    optionalServices: [SERVICE_UUID],
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  const chr = await service.getCharacteristic(CHAR_UUID);

  const chunks = [
    bytes([ESC, 0x40]),           // init
    bytes([ESC, 0x61, 0x01]),     // center
    bytes([GS, 0x21, 0x11]),      // double size
    enc.encode(title + "\n"),
    bytes([GS, 0x21, 0x00]),      // reset size
    ...(subtitle ? [enc.encode(subtitle + "\n")] : []),
    bytes([ESC, 0x61, 0x00]),     // left
    enc.encode("-".repeat(width) + "\n"),
    ...meta.map((m) => enc.encode(m + "\n")),
    enc.encode("-".repeat(width) + "\n"),
    ...items.flatMap((it) => [
      line(it.name, width),
      twoCol(`  ${it.qty} x ${it.price}`, it.total, width),
    ]),
    enc.encode("-".repeat(width) + "\n"),
    ...totals.map(([l, r]) => twoCol(l, r, width)),
    enc.encode("\n"),
    bytes([ESC, 0x61, 0x01]),     // center
    enc.encode(footer + "\n\n\n\n"),
    bytes([GS, 0x56, 0x42, 0x00]),// full cut (some printers)
  ];
  const payload = concat(chunks);

  // Send in 180-byte chunks
  for (let i = 0; i < payload.length; i += 180) {
    await chr.writeValueWithoutResponse(payload.slice(i, i + 180));
    await new Promise((r) => setTimeout(r, 40));
  }
  try { await server.disconnect(); } catch { /* noop */ }
}
