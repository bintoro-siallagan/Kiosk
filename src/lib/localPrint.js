// karyaOS — Local Print Bridge client
// Frontend helper untuk forward print job dari browser POS → local bridge (localhost:9101) → printer LAN.
// Bridge agent harus jalan di PC kasir (lihat tools/print-bridge/).
//
// Pattern: setelah order berhasil saved, panggil printOrderViaLocalBridge(orderId).
// Helper akan: (1) fetch ESC/POS bytes dari backend, (2) POST ke local bridge, (3) bridge cetak ke printer.
//
// Gagal silent — print failure gak boleh hambat customer flow. Log ke console only.

import API_HOST from "../apiBase.js";

// Default bridge endpoint — override via localStorage.printBridgeUrl kalau kasir ganti port
const DEFAULT_BRIDGE = "http://localhost:9101";

function bridgeUrl() {
  try { return localStorage.getItem("printBridgeUrl") || DEFAULT_BRIDGE; } catch { return DEFAULT_BRIDGE; }
}

// Cek bridge online (cached selama 30 detik untuk avoid repeat probes saat ramai)
let _lastHealthCheck = 0;
let _lastHealthResult = false;
export async function isBridgeOnline() {
  const now = Date.now();
  if (now - _lastHealthCheck < 30_000) return _lastHealthResult;
  _lastHealthCheck = now;
  try {
    const r = await fetch(`${bridgeUrl()}/`, { method: "GET", signal: AbortSignal.timeout?.(1500) || undefined });
    _lastHealthResult = r.ok;
  } catch {
    _lastHealthResult = false;
  }
  return _lastHealthResult;
}

// Build + cetak satu type (kitchen | customer) untuk order tertentu
export async function printOrderViaLocalBridge(orderId, type = "customer") {
  if (!orderId) return { ok: false, error: "orderId required" };
  try {
    // 1) Fetch bytes dari backend
    const r = await fetch(`${API_HOST}/api/orders/${encodeURIComponent(orderId)}/escpos?type=${type}`);
    if (!r.ok) {
      const msg = `escpos fetch ${r.status}`;
      console.warn(`[localPrint] ${type} → ${msg}`);
      return { ok: false, error: msg };
    }
    const payload = await r.json();
    if (!payload.bytes || !payload.target_ip) {
      const msg = "no bytes or target IP in escpos response";
      console.warn(`[localPrint] ${type} → ${msg}`, payload);
      return { ok: false, error: msg };
    }
    console.log(`[localPrint] ${type} → sending ${payload.bytes.length} bytes to bridge → ${payload.target_ip}:${payload.target_port}`);

    // 2) POST ke local bridge
    const bridgeRes = await fetch(`${bridgeUrl()}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: payload.target_ip, port: payload.target_port, data: payload.bytes }),
      signal: AbortSignal.timeout?.(10_000) || undefined,
    });
    const bridgeData = await bridgeRes.json().catch(() => ({}));
    if (!bridgeRes.ok || !bridgeData.ok) {
      const msg = bridgeData.error || `bridge HTTP ${bridgeRes.status}`;
      console.warn(`[localPrint] ${type} → bridge error:`, msg);
      return { ok: false, error: msg };
    }

    console.log(`✓ [localPrint] ${type} ticket printed for order ${orderId} → ${payload.target_ip}`);
    return { ok: true, target: `${payload.target_ip}:${payload.target_port}`, bytes: payload.bytes.length };
  } catch (e) {
    // Bridge offline / CORS / network — log untuk debugging tapi gak crash UX
    console.warn(`[localPrint] ${type} → exception:`, e.message, "(bridge running di localhost:9101?)");
    return { ok: false, error: e.message };
  }
}

// Convenience: cetak kitchen DULU, baru customer.
// SEQUENTIAL — bukan Promise.all — karena printer thermal cuma bisa accept
// 1 TCP connection pada satu waktu. Kalau parallel, 1 dari 2 print silently dropped.
// Jeda 800ms antara keduanya supaya printer settle buffer + cutter selesai cycle.
export async function printOrderBothViaLocalBridge(orderId) {
  const kitchen = await printOrderViaLocalBridge(orderId, "kitchen");
  await new Promise(r => setTimeout(r, 800));
  const customer = await printOrderViaLocalBridge(orderId, "customer");
  return { kitchen, customer };
}

// Test endpoint — test print page ke specific IP via bridge
export async function testPrintViaLocalBridge(ip, port = 9100) {
  try {
    const r = await fetch(`${bridgeUrl()}/print/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip, port }),
      signal: AbortSignal.timeout?.(8_000) || undefined,
    });
    const d = await r.json();
    return d;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Scan LAN cari printer aktif
export async function scanPrintersViaLocalBridge(port = 9100) {
  try {
    const r = await fetch(`${bridgeUrl()}/scan?port=${port}`, {
      signal: AbortSignal.timeout?.(20_000) || undefined,
    });
    const d = await r.json();
    return d;
  } catch (e) {
    return { ok: false, error: e.message, printers: [] };
  }
}
