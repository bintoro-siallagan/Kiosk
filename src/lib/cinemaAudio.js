// karyaOS — Cinema audio cues (Web Audio, no asset files needed)
// Subtle sound design untuk cinema transactional moments:
//   - seatPick: short bright chime saat customer tap kursi (premium feedback)
//   - seatUnpick: lower, softer un-pick sound
//   - bookingConfirmed: ascending 3-note victory cue (booking sukses)
//   - error: low descending tone (booking gagal / out of stock)
//
// Usage:
//   import { cinemaAudio } from "../lib/cinemaAudio.js";
//   cinemaAudio.seatPick();
//   cinemaAudio.bookingConfirmed();
//
// Volume + enabled persisted in localStorage. User bisa toggle via cinemaAudio.setEnabled(false).

const STORAGE_KEY = "cinemaAudioEnabled";

let _ctx = null;
function getCtx() {
  if (typeof window === "undefined") return null;
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return null; }
  }
  return _ctx;
}

function isEnabled() {
  try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return true; }
}

// Single tone — base building block
function tone(freq, durSec, type = "sine", vol = 0.06, delaySec = 0) {
  if (!isEnabled()) return;
  const ctx = getCtx(); if (!ctx) return;
  try {
    const t0 = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    // Quick attack, exponential decay — felt natural
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.02);
  } catch {}
}

// Sequence — multiple tones
function sequence(notes) {
  for (const n of notes) tone(n.freq, n.dur, n.type || "sine", n.vol || 0.06, n.delay || 0);
}

export const cinemaAudio = {
  // Seat pick — short bright chime, premium feedback
  seatPick() {
    sequence([
      { freq: 880,  dur: 0.08, type: "sine",     vol: 0.05 },
      { freq: 1320, dur: 0.12, type: "triangle", vol: 0.04, delay: 0.04 },
    ]);
  },

  // Seat un-pick — lower softer tone
  seatUnpick() {
    tone(440, 0.1, "sine", 0.04);
  },

  // Booking confirmed — ascending 3-note victory cue
  bookingConfirmed() {
    sequence([
      { freq: 523.25,  dur: 0.18, type: "sine", vol: 0.08, delay: 0    },   // C5
      { freq: 659.25,  dur: 0.18, type: "sine", vol: 0.08, delay: 0.12 },   // E5
      { freq: 783.99,  dur: 0.32, type: "sine", vol: 0.08, delay: 0.24 },   // G5
    ]);
  },

  // Error — low descending tone
  error() {
    sequence([
      { freq: 440, dur: 0.12, type: "square", vol: 0.05 },
      { freq: 330, dur: 0.18, type: "square", vol: 0.05, delay: 0.08 },
    ]);
  },

  // Page transition — gentle whoosh-like effect (lo-fi)
  transition() {
    tone(220, 0.18, "triangle", 0.04);
  },

  setEnabled(b) {
    try { localStorage.setItem(STORAGE_KEY, b ? "1" : "0"); } catch {}
  },
  isEnabled,
};
