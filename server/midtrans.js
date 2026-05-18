// ─── MIDTRANS PAYMENT GATEWAY MODULE ─────────────────────────────────────
// Persistent config via midtrans-config.json. Backward compat with .env.
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "midtrans-config.json");

const DEFAULTS = {
  serverKey: "",
  clientKey: "",
  isProduction: false,
  enabledMethods: ["qris", "gopay", "shopeepay"],
  merchantId: "",
  notificationUrl: "",
  updatedAt: null,
};

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      _cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
    } else {
      // First boot: seed from .env for backward compat
      _cache = {
        ...DEFAULTS,
        serverKey: process.env.MIDTRANS_SERVER_KEY || "",
        clientKey: process.env.MIDTRANS_CLIENT_KEY || "",
        isProduction: process.env.MIDTRANS_PRODUCTION === "true",
        updatedAt: Date.now(),
      };
      saveConfig(_cache);
      console.log("💳 Midtrans config seeded from .env → midtrans-config.json");
    }
  } catch (e) {
    console.error("Midtrans config load fail:", e.message);
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

function saveConfig(cfg) {
  const merged = { ...DEFAULTS, ...cfg, updatedAt: Date.now() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  _cache = merged;
  return merged;
}

function getConfig() { return loadConfig(); }

function getBaseUrl() {
  return loadConfig().isProduction
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
}

function getAuthHeader() {
  const sk = loadConfig().serverKey || "";
  return "Basic " + Buffer.from(sk + ":").toString("base64");
}

async function request(method, urlPath, body) {
  const url = getBaseUrl() + urlPath;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": getAuthHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok && !data.status_code) data.status_code = String(res.status);
  return data;
}

// Sanity check: hit a non-existent transaction. 401 = invalid key, 404 = key OK.
async function testConnection() {
  const cfg = loadConfig();
  if (!cfg.serverKey) return { ok: false, error: "Server key kosong" };
  try {
    const result = await request("GET", "/v2/sanity-check-12345/status");
    // 404 expected when key is valid (order doesn't exist)
    // 401 when key is invalid (unauthorized)
    if (result.status_code === "404" || result.status_code === "401" && result.status_message?.includes("not found")) {
      return { ok: true, mode: cfg.isProduction ? "production" : "sandbox", merchantId: cfg.merchantId };
    }
    if (result.status_code === "401") {
      return { ok: false, error: "Server key invalid (401)" };
    }
    // Any other response: key is at least authenticating
    return { ok: true, mode: cfg.isProduction ? "production" : "sandbox", raw: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function isReady() {
  const cfg = loadConfig();
  return !!cfg.serverKey;
}

module.exports = { getConfig, saveConfig, getBaseUrl, getAuthHeader, request, testConnection, isReady };
