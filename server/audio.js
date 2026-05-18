// ─── AUDIO CONFIG MODULE (server-side persistence) ──────────────────────
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "audio-config.json");

const DEFAULTS = {
  enabled:       true,
  volume:        0.5,
  ttsEnabled:    true,
  ttsPhrase:     "Terima kasih kakak",
  ttsLang:       "id-ID",
  // Per-profile toggle (admin can selectively disable any sound)
  profiles: {
    newOrder:        true,  // admin dashboard cha-ching
    orderReady:      true,  // bell for ready
    kitchenAlert:    true,
    paymentSuccess:  true,  // chime + voice at konfirmasi
    addToCart:       true,
    tap:             true,
    click:           true,
    swoosh:          true,
    confirm:         true,
    error:           true,
  },
  updatedAt: null,
};

let _cache = null;

function loadConfig() {
  if (_cache) return _cache;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      _cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
      // Ensure profiles object merged (in case old config missing some)
      _cache.profiles = { ...DEFAULTS.profiles, ...(_cache.profiles || {}) };
    } else {
      _cache = { ...DEFAULTS, updatedAt: Date.now() };
      saveConfig(_cache);
      console.log("🔊 Audio config seeded → audio-config.json");
    }
  } catch (e) {
    console.error("Audio config load fail:", e.message);
    _cache = { ...DEFAULTS };
  }
  return _cache;
}

function saveConfig(cfg) {
  const merged = { ...DEFAULTS, ...cfg, profiles: { ...DEFAULTS.profiles, ...(cfg.profiles || {}) }, updatedAt: Date.now() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
  _cache = merged;
  return merged;
}

function getConfig() { return loadConfig(); }

module.exports = { getConfig, saveConfig };
