// ─── AUDIO NOTIFICATIONS — Web Audio synth (no files needed) ───────────────
let _ctx = null;
let _unlocked = false;
let _volume = 0.5;
let _enabled = true;

function getCtx() {
  if (!_ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    _ctx = new AC();
  }
  return _ctx;
}


// ─── BACKEND CONFIG SYNC ─────────────────────────────────────────────
let _config = {
  enabled: true, volume: 0.5, ttsEnabled: true,
  ttsPhrase: "Terima kasih kakak", ttsLang: "id-ID",
  profiles: { newOrder: true, orderReady: true, kitchenAlert: true, paymentSuccess: true,
              addToCart: true, tap: true, click: true, swoosh: true, confirm: true, error: true },
};

// Map profile key → uploaded audio file URL (loaded from backend)
let _customByProfile = {}; // { tap: "/audio/tap.mp3", click: "/audio/click.wav", ... }
const PROFILE_KEYS = ["newOrder","orderReady","kitchenAlert","paymentSuccess","addToCart","tap","click","swoosh","confirm","error","thanks"];

function playCustomFile(profile) {
  // Returns true if custom file exists and starts playing; false if no file (caller falls back to synth)
  const url = _customByProfile[profile];
  if (!url) return false;
  try {
    const a = new Audio(url);
    a.volume = _volume;
    a.play().catch(()=>{});
    return true;
  } catch { return false; }
}

export async function loadAudioConfig(apiUrl) {
  try {
    const base = apiUrl || (import.meta.env?.VITE_API_URL) || "http://localhost:3001";
    const res = await fetch(base + "/api/admin/audio-config");
    if (res.ok) {
      const cfg = await res.json();
      _config = { ..._config, ...cfg, profiles: { ..._config.profiles, ...(cfg.profiles||{}) } };
      _volume = _config.volume;
      _enabled = _config.enabled;
      _ttsPhrase = _config.ttsPhrase;
      _ttsEnabled = _config.ttsEnabled;
    }
    // Also fetch list of uploaded files → map to profile
    const filesRes = await fetch(base + "/api/admin/audio");
    if (filesRes.ok) {
      const filesData = await filesRes.json();
      _customByProfile = {};
      (filesData.files || []).forEach(f => {
        const baseName = f.name.replace(/\.[^.]+$/, "").toLowerCase();
        // Match against profile keys (case-insensitive)
        const match = PROFILE_KEYS.find(k => k.toLowerCase() === baseName);
        if (match) _customByProfile[match] = `${base}/audio/${f.name}`;
      });
      console.log("🔊 Audio config loaded:", Object.keys(_customByProfile).length, "custom files");
    }
  } catch (e) { console.warn("🔊 Audio config fetch fail:", e.message); }
}

function shouldPlay(profile) {
  return _config.enabled && (_config.profiles?.[profile] !== false);
}

export function getServerConfig() { return _config; }
export function applyServerConfig(cfg) {
  _config = { ..._config, ...cfg, profiles: { ..._config.profiles, ...(cfg.profiles||{}) } };
  _volume = _config.volume; _enabled = _config.enabled;
  _ttsPhrase = _config.ttsPhrase; _ttsEnabled = _config.ttsEnabled;
}

// Unlock audio on first user gesture (autoplay policy)
export function unlockAudio() {
  if (_unlocked) return;
  const ctx = getCtx();
  if (!ctx) return;
  ctx.resume?.();
  // Silent buffer to satisfy unlock requirement
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  _unlocked = true;
  console.log("🔊 Audio unlocked");
}

function tone({ freq, duration = 0.2, type = "sine", startAt = 0, vol = 1 }) {
  if (!_enabled) return;
  const ctx = getCtx();
  if (!ctx) { console.warn("🔊 No AudioContext available"); return; }
  if (ctx.state === "suspended") {
    // Try resume (fire-and-forget); play anyway, browser will buffer/queue
    ctx.resume().catch(()=>{});
  }
  const t0 = ctx.currentTime + startAt;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(_volume * vol * 0.4, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

// ── PROFILE: NEW ORDER (admin dashboard) — cheerful "cha-ching" C-E-G ──
export function playNewOrder() {
  if (!shouldPlay("newOrder")) return;
  if (playCustomFile("newOrder")) return; // custom file plays, skip synth
  tone({ freq: 523.25, duration: 0.18, startAt: 0    }); // C5
  tone({ freq: 659.25, duration: 0.18, startAt: 0.10 }); // E5
  tone({ freq: 783.99, duration: 0.35, startAt: 0.20 }); // G5
}

// ── PROFILE: ORDER READY (kasir announce) — pleasant 2-tone bell ──
export function playOrderReady() {
  if (!shouldPlay("orderReady")) return;
  if (playCustomFile("orderReady")) return; // custom file plays, skip synth
  tone({ freq: 880,    duration: 0.25, startAt: 0,    type: "triangle" }); // A5
  tone({ freq: 1108.7, duration: 0.45, startAt: 0.18, type: "triangle" }); // C#6
}

// ── PROFILE: KITCHEN ALERT — urgent double square beep ──
export function playKitchenAlert() {
  if (!shouldPlay("kitchenAlert")) return;
  if (playCustomFile("kitchenAlert")) return; // custom file plays, skip synth
  tone({ freq: 880, duration: 0.08, startAt: 0,    type: "square", vol: 0.7 });
  tone({ freq: 880, duration: 0.08, startAt: 0.15, type: "square", vol: 0.7 });
  tone({ freq: 880, duration: 0.08, startAt: 0.30, type: "square", vol: 0.7 });
}

// ── PROFILE: PAYMENT SUCCESS (customer) — warm rising chime ──
export function playPaymentSuccess() {
  if (!shouldPlay("paymentSuccess")) return;
  if (playCustomFile("paymentSuccess")) return; // custom file plays, skip synth
  tone({ freq: 523.25, duration: 0.12, startAt: 0,    type: "sine" });
  tone({ freq: 659.25, duration: 0.12, startAt: 0.08, type: "sine" });
  tone({ freq: 783.99, duration: 0.18, startAt: 0.16, type: "sine" });
  tone({ freq: 1046.5, duration: 0.35, startAt: 0.24, type: "sine" });
}

// ── PROFILE: ERROR ── (bonus, for failed payments etc)
export function playError() {
  if (!shouldPlay("error")) return;
  if (playCustomFile("error")) return; // custom file plays, skip synth
  tone({ freq: 220, duration: 0.15, startAt: 0,    type: "sawtooth", vol: 0.6 });
  tone({ freq: 196, duration: 0.30, startAt: 0.12, type: "sawtooth", vol: 0.6 });
}


// ── KIOSK JOURNEY SOUNDS ──
// Light tap — for menu item / button press
export function playTap() {
  if (!shouldPlay("tap")) return;
  if (playCustomFile("tap")) return; // custom file plays, skip synth
  tone({ freq: 1200, duration: 0.05, type: "sine", vol: 0.5 });
}

// Numpad / topping toggle — subtle click
export function playClick() {
  if (!shouldPlay("click")) return;
  if (playCustomFile("click")) return; // custom file plays, skip synth
  tone({ freq: 800, duration: 0.04, type: "square", vol: 0.4 });
}

// Add to cart — small celebratory chime (2 notes)
export function playAddToCart() {
  if (!shouldPlay("addToCart")) return;
  if (playCustomFile("addToCart")) return; // custom file plays, skip synth
  tone({ freq: 659.25, duration: 0.10, type: "sine" }); // E5
  tone({ freq: 988,    duration: 0.18, type: "sine", startAt: 0.06 }); // B5
}

// Scene transition / next step — soft swoosh
export function playSwoosh() {
  if (!shouldPlay("swoosh")) return;
  if (playCustomFile("swoosh")) return; // custom file plays, skip synth
  tone({ freq: 440,  duration: 0.12, type: "triangle", vol: 0.5 });
  tone({ freq: 660,  duration: 0.18, type: "triangle", startAt: 0.05, vol: 0.5 });
}

// Generic action confirm — 2-tone up
export function playConfirm() {
  if (!shouldPlay("confirm")) return;
  if (playCustomFile("confirm")) return; // custom file plays, skip synth
  tone({ freq: 587.33, duration: 0.10, type: "sine" }); // D5
  tone({ freq: 880,    duration: 0.20, type: "sine", startAt: 0.07 }); // A5
}

// ── CONFIG ──
export function setVolume(v)   { _volume = Math.max(0, Math.min(1, v)); localStorage.setItem("audio_volume", _volume); }
export function setEnabled(b)  { _enabled = !!b; localStorage.setItem("audio_enabled", _enabled ? "1" : "0"); }
export function getVolume()    { return _volume; }
export function isEnabled()    { return _enabled; }

// Load persisted settings on import
try {
  const v = parseFloat(localStorage.getItem("audio_volume"));
  if (!isNaN(v)) _volume = v;
  const e = localStorage.getItem("audio_enabled");
  if (e !== null) _enabled = e === "1";
} catch {}


// ── TEXT-TO-SPEECH (Indonesian voice if available) ─────────────────
let _voicesCache = null;
function getVoices() {
  if (!_voicesCache && 'speechSynthesis' in window) {
    _voicesCache = window.speechSynthesis.getVoices();
    // Voices may load async — re-fetch on voiceschanged event
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      _voicesCache = window.speechSynthesis.getVoices();
    });
  }
  return _voicesCache || [];
}

let _ttsEnabled = true;
let _ttsPhrase  = "Terima kasih kakak";

export function speak(text, opts = {}) {
  if (!_ttsEnabled) return;
  if (!('speechSynthesis' in window)) { console.warn("🔊 SpeechSynthesis not supported"); return; }
  const u = new SpeechSynthesisUtterance(text);
  u.lang   = opts.lang   || "id-ID";
  u.rate   = opts.rate   ?? 1.0;
  u.pitch  = opts.pitch  ?? 1.1;
  u.volume = opts.volume ?? Math.min(1, _volume + 0.3);
  // Pick Indonesian voice if found
  const voices = getVoices();
  const idVoice = voices.find(v => v.lang.toLowerCase().startsWith("id"))
                || voices.find(v => v.lang.toLowerCase().startsWith("en") && /female/i.test(v.name))
                || voices[0];
  if (idVoice) u.voice = idVoice;
  // Cancel any in-flight speech first to avoid queue
  try { window.speechSynthesis.cancel(); } catch {}
  window.speechSynthesis.speak(u);
  console.log("🔊 Speak:", text, "voice:", idVoice?.name || "default");
}


// Try play audio file from backend; on error/404 fall back to TTS speak
const API_URL = (import.meta && import.meta.env && import.meta.env.VITE_API_URL) || "http://localhost:3001";

async function tryPlayAudioFile(name) {
  return new Promise((resolve) => {
    const url = `${API_URL}/audio/${name}?t=${Date.now()}`;
    const a = new Audio(url);
    a.volume = Math.min(1, _volume + 0.3);
    a.oncanplaythrough = () => { a.play().then(() => resolve(true)).catch(() => resolve(false)); };
    a.onerror = () => resolve(false);
    // Timeout 1.5s if file unreachable
    setTimeout(() => resolve(false), 1500);
  });
}

export async function speakThanks() {
  // Try custom uploaded file first (thanks.mp3, thanks.wav, thanks.ogg)
  for (const ext of ["mp3","wav","ogg"]) {
    const ok = await tryPlayAudioFile("thanks." + ext);
    if (ok) { console.log("🔊 Played custom audio: thanks." + ext); return; }
  }
  // Fallback to TTS
  speak(_ttsPhrase);
}

export function setTTSPhrase(text)  { _ttsPhrase = text; localStorage.setItem("tts_phrase", text); }
export function getTTSPhrase()      { return _ttsPhrase; }
export function setTTSEnabled(b)    { _ttsEnabled = !!b; localStorage.setItem("tts_enabled", _ttsEnabled ? "1" : "0"); }
export function isTTSEnabled()      { return _ttsEnabled; }

// Load persisted TTS settings
try {
  const p = localStorage.getItem("tts_phrase");   if (p) _ttsPhrase = p;
  const e = localStorage.getItem("tts_enabled");  if (e !== null) _ttsEnabled = e === "1";
} catch {}

// Prime voices list on module load (helps Safari/Chrome populate)
if ('speechSynthesis' in window) {
  setTimeout(() => getVoices(), 100);
}

// Test plays (for admin UI preview)
export const PROFILES = {
  newOrder:        { name: "🛎 Pesanan Baru",         play: playNewOrder },
  orderReady:      { name: "🔔 Pesanan Siap",          play: playOrderReady },
  kitchenAlert:    { name: "⚡ Kitchen Alert",          play: playKitchenAlert },
  paymentSuccess:  { name: "✅ Pembayaran Berhasil",   play: playPaymentSuccess },
  addToCart:       { name: "🛒 Add to Cart",            play: playAddToCart },
  tap:             { name: "👆 Tap (menu)",             play: playTap },
  click:           { name: "🔘 Click (numpad)",         play: playClick },
  swoosh:          { name: "💨 Scene Transition",       play: playSwoosh },
  confirm:         { name: "✓ Action Confirm",          play: playConfirm },
  error:           { name: "❌ Error",                   play: playError },
};
