// src/SignageLauncher.jsx
//
// TV-friendly launcher page — buka di browser TV/tablet, tampil 5 zone
// sebagai tombol besar. Tap salah satu → langsung jalan player untuk zone itu.
// Tidak perlu typing device_id manual (anti-typo TV remote).
//
// URL: https://{host}/?signage-launcher&outlet=OTL-007

import { useEffect, useState } from "react";
import API_HOST from "./apiBase.js";

const ZONE_META = {
  // F&B
  "menu-board":   { icon: "🍔", label: "Menu Board",    desc: "TV besar di atas counter — menu + harga", color: "#f97316" },
  "counter-side": { icon: "🏪", label: "Counter Side",  desc: "Promo + combo carousel",                  color: "#fbbf24" },
  "dining-area":  { icon: "🪑", label: "Dining Area",   desc: "Favorit + chef choice",                    color: "#22d3ee" },
  "pickup":       { icon: "🛒", label: "Order Pickup",  desc: "Antrian pesanan siap",                     color: "#10b981" },
  "window":       { icon: "🪟", label: "Window",        desc: "Walk-in attractor",                        color: "#a855f7" },
  // Cinema
  "lobby":           { icon: "🏛️", label: "Lobby",           desc: "Now showing + Coming Soon", color: "#a855f7" },
  "box-office":      { icon: "🎟️", label: "Box Office",      desc: "Jadwal hari ini + harga",    color: "#fbbf24" },
  "fnb-counter":     { icon: "🍿", label: "F&B Counter",      desc: "Combo bundles",              color: "#f97316" },
  "studio-entrance": { icon: "🚪", label: "Studio Entrance",  desc: "Film aktif + next show",     color: "#22d3ee" },
};

export default function SignageLauncher() {
  const [outlet, setOutlet] = useState("");
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const o = (q.get("outlet") || "").toUpperCase();
      setOutlet(o);
      if (!o) { setErr("Parameter ?outlet wajib di-set di URL"); setLoading(false); return; }

      fetch(`${API_HOST}/api/signage/devices`)
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then(d => {
          const list = (d.devices || []).filter(dv => dv.outlet === o);
          setDevices(list);
          setLoading(false);
          if (!list.length) setErr(`Tidak ada device signage untuk outlet ${o}. Setup dulu via Admin → Setup Outlet (Step 6).`);
        })
        .catch(e => { setErr(e.message); setLoading(false); });
    } catch (e) { setErr(String(e)); setLoading(false); }
  }, []);

  const launch = (deviceId) => {
    window.location.href = `${window.location.origin}/?signage&device=${encodeURIComponent(deviceId)}`;
  };

  return (
    <div style={S.root}>
      <div style={S.bgGlow1} />
      <div style={S.bgGlow2} />

      <div style={S.header}>
        <div style={S.eyebrow}>📺 SIGNAGE LAUNCHER</div>
        <div style={S.title}>Pilih layar untuk dipasang</div>
        {outlet && <div style={S.outletPill}>📍 {outlet}</div>}
      </div>

      {loading && (
        <div style={S.center}>
          <div style={{ fontSize: 60, marginBottom: 14 }}>⏳</div>
          <div style={{ color: "#9da7b3", fontSize: 16 }}>Sebentar ya, kami muat daftar device…</div>
        </div>
      )}

      {err && !loading && (
        <div style={S.errBox}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🌱</div>
          <div style={{ fontSize: 18, color: "#fca5a5", fontWeight: 700, marginBottom: 8 }}>{err}</div>
          <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
            Buka admin.karyaos.tech → klik ✨ Setup Outlet → Step 6 (Signage) → klik Lanjut untuk seed 5 device.
          </div>
        </div>
      )}

      {!loading && !err && devices.length > 0 && (
        <div style={S.grid}>
          {devices.map(d => {
            const meta = ZONE_META[d.zone] || { icon: "📺", label: d.zone, desc: "" , color: "#94a3b8" };
            return (
              <button key={d.device_id} onClick={() => launch(d.device_id)} style={{ ...S.card, borderColor: `${meta.color}55` }}>
                <div style={{ fontSize: 80, lineHeight: 1, filter: `drop-shadow(0 8px 24px ${meta.color}30)` }}>{meta.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", letterSpacing: -0.5, marginTop: 14 }}>{meta.label}</div>
                <div style={{ fontSize: 13, color: "#9da7b3", marginTop: 6, lineHeight: 1.5, maxWidth: 220 }}>{meta.desc}</div>
                <div style={{ marginTop: 18, padding: "10px 24px", background: `${meta.color}1a`, border: `1px solid ${meta.color}66`, borderRadius: 999, color: meta.color, fontSize: 12, fontWeight: 700, fontFamily: "'Geist Mono',monospace", letterSpacing: 1 }}>
                  ▶ TAP UNTUK BUKA
                </div>
                <div style={{ marginTop: 12, fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{d.device_id}</div>
              </button>
            );
          })}
        </div>
      )}

      <div style={S.footer}>
        <span style={{ color: "#5b6470" }}>karyaOS Signage · {devices.length} layar siap</span>
      </div>
    </div>
  );
}

const S = {
  root: {
    position: "fixed", inset: 0,
    background: "radial-gradient(ellipse at top left, rgba(168,85,247,0.10), transparent 50%), radial-gradient(ellipse at bottom right, rgba(251,191,36,0.08), transparent 50%), linear-gradient(160deg,#0a0e16 0%,#11141d 50%,#1a1f2e 100%)",
    color: "#fff", fontFamily: "'Inter','SF Pro Display',system-ui,sans-serif",
    display: "flex", flexDirection: "column", overflow: "hidden", padding: "32px 40px",
  },
  bgGlow1: { position: "absolute", top: "-10%", left: "-10%", width: 600, height: 600, background: "radial-gradient(circle, rgba(168,85,247,0.10), transparent 70%)", pointerEvents: "none" },
  bgGlow2: { position: "absolute", bottom: "-10%", right: "-10%", width: 600, height: 600, background: "radial-gradient(circle, rgba(251,191,36,0.08), transparent 70%)", pointerEvents: "none" },
  header: { textAlign: "center", marginBottom: 36, position: "relative", zIndex: 1 },
  eyebrow: { fontSize: 12, color: "#a855f7", letterSpacing: 6, fontFamily: "'Geist Mono',monospace", fontWeight: 800, marginBottom: 8 },
  title: { fontSize: 42, fontWeight: 900, letterSpacing: -1, color: "#fff", marginBottom: 14 },
  outletPill: { display: "inline-block", padding: "8px 18px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 999, fontSize: 14, color: "#fbbf24", fontFamily: "'Geist Mono',monospace", fontWeight: 700, letterSpacing: 1 },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", position: "relative", zIndex: 1 },
  errBox: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: 40, position: "relative", zIndex: 1 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20, flex: 1, alignContent: "start", maxWidth: 1400, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 },
  card: {
    background: "rgba(255,255,255,0.03)", border: "1px solid",
    borderRadius: 20, padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center",
    cursor: "pointer", textAlign: "center", color: "#fff", fontFamily: "inherit",
    transition: "transform 0.15s ease, background 0.15s ease, border-color 0.15s ease",
    boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
  },
  footer: { textAlign: "center", padding: "16px 0 0", fontSize: 12, fontFamily: "'Geist Mono',monospace", letterSpacing: 1, position: "relative", zIndex: 1 },
};
