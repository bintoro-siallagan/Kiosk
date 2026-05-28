#!/usr/bin/env node
// karyaOS — POS Print Bridge
// Jalan di PC kasir (localhost). Browser POS POST ESC/POS bytes ke sini,
// bridge forward via raw TCP ke printer thermal di LAN.
//
//   Backend VPS gak bisa reach printer LAN — itu sebabnya bridge ini ada.
//   Browser bisa reach localhost:9101 + LAN printer dari Network. POS fetch ke
//   sini setelah order saved, lalu bridge yg ngomong ke printer.
//
// Endpoints:
//   GET  /              health check + config
//   POST /print         { ip, port, data: [byte, byte, ...] }  → cetak ke ip:port
//   POST /print/test    { ip, port }                            → init + beep + cut
//   GET  /scan          scan LAN 10.0.0.0/24 untuk printer aktif di port 9100
//
// Run: node print-bridge.js
// Default listen: 0.0.0.0:9101 (biar bisa diakses dari device lain di LAN juga)
//
// Set env PRINT_BRIDGE_PORT untuk override port.

const http = require("http");
const net  = require("net");
const url  = require("url");

const PORT = parseInt(process.env.PRINT_BRIDGE_PORT, 10) || 9101;
const VERSION = "1.0.0";

// CORS — allow all origins (POS bisa dari berbagai domain: app.karyaos.tech, localhost, dll)
// + Private Network Access — Chrome 94+ butuh header ini saat public site (https://app.karyaos.tech)
//   call private IP (localhost). Tanpa ini browser blok preflight.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Max-Age": "3600",
};

// Per-target queue — printer thermal cuma terima 1 TCP connection pada satu waktu.
// Kalau 2 print masuk bareng untuk IP yg sama, queue serialize biar gak collision.
const _printQueues = new Map(); // key: "ip:port", value: Promise chain
function tcpPrintQueued(ip, port, data, timeoutMs = 5000) {
  const key = `${ip}:${port}`;
  const prev = _printQueues.get(key) || Promise.resolve();
  const next = prev
    .catch(() => {}) // jangan biarin error sebelumnya hambat queue
    .then(() => tcpPrintRaw(ip, port, data, timeoutMs))
    .then(async (result) => {
      // Tambah jeda 300ms setelah print selesai biar printer settle (buffer + cutter cycle)
      await new Promise(r => setTimeout(r, 300));
      return result;
    });
  _printQueues.set(key, next);
  // cleanup queue entry kalau no one chained ke kita
  next.finally(() => {
    if (_printQueues.get(key) === next) _printQueues.delete(key);
  });
  return next;
}

function tcpPrintRaw(ip, port, data, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      client.destroy();
      reject(new Error(`Timeout setelah ${timeoutMs}ms — printer ${ip}:${port} tidak respond`));
    }, timeoutMs);

    client.connect(port, ip, () => {
      try {
        client.write(Buffer.from(data));
        client.end();
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    });

    client.on("close", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(true);
    });

    client.on("error", (e) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
  });
}

// Public alias — semua print job lewat queue
const tcpPrint = tcpPrintQueued;

function tcpProbe(ip, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let resolved = false;
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      client.destroy();
      resolve(false);
    }, timeoutMs);
    client.connect(port, ip, () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      client.destroy();
      resolve(true);
    });
    client.on("error", () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(false);
    });
  });
}

// Get all local IPv4 LAN subnets — untuk scan
function getLocalSubnets() {
  const os = require("os");
  const subnets = new Set();
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family !== "IPv4" || i.internal) continue;
      // ambil /24 dari IP (asumsi mostly /24 di LAN outlet)
      const m = i.address.match(/^(\d+\.\d+\.\d+)\.\d+$/);
      if (m) subnets.add(m[1]);
    }
  }
  return [...subnets];
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 10 * 1024 * 1024) { req.destroy(); reject(new Error("body too large (>10MB)")); } });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error("invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const u = url.parse(req.url, true);
  const ts = new Date().toISOString();

  try {
    // GET / — health
    if (req.method === "GET" && u.pathname === "/") {
      return sendJson(res, 200, {
        ok: true,
        service: "karyaOS-print-bridge",
        version: VERSION,
        host: require("os").hostname(),
        subnets: getLocalSubnets().map(s => `${s}.0/24`),
        endpoints: ["GET /", "POST /print", "POST /print/test", "GET /scan"],
      });
    }

    // POST /print — { ip, port, data: [bytes...] }
    if (req.method === "POST" && u.pathname === "/print") {
      const body = await readBody(req);
      const { ip, port = 9100, data } = body || {};
      if (!ip || !data) return sendJson(res, 400, { ok: false, error: "ip + data required" });
      if (!Array.isArray(data)) return sendJson(res, 400, { ok: false, error: "data must be byte array" });
      console.log(`[${ts}] POST /print → ${ip}:${port} (${data.length} bytes)`);
      await tcpPrint(ip, parseInt(port, 10), data);
      console.log(`[${ts}] ✓ printed ${data.length} bytes to ${ip}:${port}`);
      return sendJson(res, 200, { ok: true, bytes: data.length, target: `${ip}:${port}` });
    }

    // POST /print/test — { ip, port }  → init + beep + cut
    if (req.method === "POST" && u.pathname === "/print/test") {
      const body = await readBody(req);
      const { ip, port = 9100 } = body || {};
      if (!ip) return sendJson(res, 400, { ok: false, error: "ip required" });
      // ESC/POS: init + 2 lines feed + cut + 2 beep
      const bytes = [
        0x1B, 0x40,                                              // ESC @ — init
        0x1B, 0x61, 0x01,                                        // center align
        ...Buffer.from("=== karyaOS Print Test ===\n").toJSON().data,
        ...Buffer.from(`${new Date().toLocaleString("id-ID")}\n`).toJSON().data,
        ...Buffer.from(`Bridge: ${require("os").hostname()}\n`).toJSON().data,
        ...Buffer.from(`Target: ${ip}:${port}\n\n\n`).toJSON().data,
        0x1B, 0x42, 0x02, 0x02,                                  // ESC B 2 2 — buzzer 2 beeps
        0x1D, 0x56, 0x41, 0x03,                                  // GS V A 3 — full cut
      ];
      console.log(`[${ts}] POST /print/test → ${ip}:${port}`);
      await tcpPrint(ip, parseInt(port, 10), bytes);
      console.log(`[${ts}] ✓ test page printed to ${ip}:${port}`);
      return sendJson(res, 200, { ok: true, message: `Test page sent to ${ip}:${port}` });
    }

    // GET /scan — scan LAN /24 untuk printer di port 9100
    if (req.method === "GET" && u.pathname === "/scan") {
      const port = parseInt(u.query.port, 10) || 9100;
      const subnets = u.query.subnet ? [u.query.subnet] : getLocalSubnets();
      if (subnets.length === 0) return sendJson(res, 200, { ok: true, printers: [], note: "no LAN interface found" });
      console.log(`[${ts}] GET /scan → subnets ${subnets.join(",")} port ${port}`);
      const found = [];
      // Scan parallel — semua subnet, semua 1-254
      const promises = [];
      for (const sub of subnets) {
        for (let i = 1; i <= 254; i++) {
          const ip = `${sub}.${i}`;
          promises.push(tcpProbe(ip, port, 250).then(ok => { if (ok) found.push(`${ip}:${port}`); }));
        }
      }
      await Promise.all(promises);
      console.log(`[${ts}] ✓ scan done — ${found.length} printer(s) found: ${found.join(", ") || "none"}`);
      return sendJson(res, 200, { ok: true, printers: found, scanned_subnets: subnets, port });
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  } catch (e) {
    console.error(`[${ts}] ✗ ${req.method} ${req.url}:`, e.message);
    sendJson(res, 500, { ok: false, error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("════════════════════════════════════════════════════════");
  console.log("  karyaOS POS Print Bridge");
  console.log("════════════════════════════════════════════════════════");
  console.log(`  Listening : http://0.0.0.0:${PORT}`);
  console.log(`  LAN host  : ${require("os").hostname()}`);
  console.log(`  Subnets   : ${getLocalSubnets().join(", ") || "(none detected)"}`);
  console.log("");
  console.log("  Endpoints:");
  console.log(`    GET  http://localhost:${PORT}/              health + info`);
  console.log(`    POST http://localhost:${PORT}/print         { ip, port, data: [bytes] }`);
  console.log(`    POST http://localhost:${PORT}/print/test    { ip, port }`);
  console.log(`    GET  http://localhost:${PORT}/scan?port=9100 scan LAN untuk printer`);
  console.log("");
  console.log("  Press Ctrl+C to stop.");
  console.log("════════════════════════════════════════════════════════");
  console.log("");
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`✗ Port ${PORT} already in use. Mungkin print bridge sudah jalan? Set PRINT_BRIDGE_PORT=<lain> kalau mau ganti.`);
  } else {
    console.error("✗ Server error:", e);
  }
  process.exit(1);
});
