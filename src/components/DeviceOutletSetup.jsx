// karyaOS — Device Outlet Setup Wizard
// First-launch screen: kasir set outlet ID untuk device ini.
// Storage hierarchy (priority high → low):
//   1. URL ?outlet=X         — one-shot override (testing)
//   2. localStorage.posOutletDevice  — device-level binding (PRIMARY, dari wizard ini)
//   3. user.outlet_code      — user-level (kalau admin set di Users)
//   4. localStorage.posOutlet — legacy manual override
//
// Setelah set, semua kasir login di device ini auto-bind outlet sama.
// Cuma admin yang bisa reset (klik logo 5x atau via admin panel).
import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";

const DEVICE_OUTLET_KEY = "posOutletDevice";

// Helper untuk dipanggil dari luar — resolve outlet code dengan priority hierarchy
export function resolveOutletCode(userOutletCode) {
  if (typeof window === "undefined") return "";
  const url = new URLSearchParams(window.location.search).get("outlet");
  if (url) return url;
  const device = localStorage.getItem(DEVICE_OUTLET_KEY);
  if (device) return device;
  if (userOutletCode) return userOutletCode;
  return localStorage.getItem("posOutlet") || "";
}

export function getDeviceOutlet() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEVICE_OUTLET_KEY);
}

export function setDeviceOutlet(code) {
  if (!code) {
    localStorage.removeItem(DEVICE_OUTLET_KEY);
  } else {
    localStorage.setItem(DEVICE_OUTLET_KEY, code);
  }
}

// Setup wizard component — render kalau posOutletDevice belum set.
// vertical: "fnb" | "cinema" — untuk filter outlet list.
export default function DeviceOutletSetup({ vertical = "fnb", onDone }) {
  const [outlets, setOutlets] = useState([]);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_HOST}/api/outlet-master`).then(r => r.json()).then(d => {
      const all = d.outlets || [];
      const filtered = vertical === "cinema"
        ? all.filter(o => o.vertical === "cinema" || o.vertical === "hybrid")
        : vertical === "fnb"
          ? all.filter(o => o.vertical === "fnb" || o.vertical === "hybrid")
          : all;
      setOutlets(filtered);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [vertical]);

  const confirm = () => {
    if (!selected) return;
    setDeviceOutlet(selected);
    onDone?.(selected);
    // Reload supaya semua child component pick up the new device outlet
    location.reload();
  };

  const filtered = search.trim()
    ? outlets.filter(o => {
        const q = search.toLowerCase();
        return o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q) || (o.area || "").toLowerCase().includes(q);
      })
    : outlets;

  const accent = vertical === "cinema" ? "#A855F7" : "#38BDF8";

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "radial-gradient(ellipse 80% 60% at 50% 30%, rgba(56,189,248,0.08), transparent 60%), linear-gradient(160deg, #0a0e16, #12141c, #1a1d2a)",
      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, zIndex: 99998, overflowY: "auto",
      fontFamily: "'Inter','SF Pro Text',system-ui,sans-serif",
    }}>
      <div style={{
        width: "min(560px, 100%)", background: "rgba(13,17,23,0.85)",
        border: `1px solid ${accent}40`, borderRadius: 18,
        padding: 32, boxShadow: `0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px ${accent}20`,
        backdropFilter: "blur(20px)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 56, marginBottom: 14, filter: `drop-shadow(0 0 24px ${accent}50)` }}>
            {vertical === "cinema" ? "🎬" : "🍽️"}
          </div>
          <div style={{
            fontSize: 11, color: accent, letterSpacing: 3,
            fontFamily: "'Geist Mono',monospace", fontWeight: 800, textTransform: "uppercase", marginBottom: 8,
          }}>● Setup Awal Device</div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0, marginBottom: 8, letterSpacing: -0.6, color: "#fff" }}>
            Pilih Outlet Device Ini
          </h1>
          <p style={{ fontSize: 13.5, color: "#9ca3af", margin: 0, lineHeight: 1.55, maxWidth: 420, marginInline: "auto" }}>
            Set outlet sekali aja per device. Semua kasir yang login di sini auto-bind ke outlet ini.
            {vertical === "cinema" ? " Showtime, tiket, dan summary akan terfilter ke outlet ini." : " Order, struk, dan report akan terfilter ke outlet ini."}
          </p>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Cari outlet (nama, kode, area)..."
          style={{
            width: "100%", padding: "12px 14px",
            background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, color: "#fff", fontSize: 14, fontFamily: "inherit",
            outline: "none", marginBottom: 14, boxSizing: "border-box",
          }}
        />

        {/* Outlet list */}
        <div style={{
          maxHeight: 320, overflowY: "auto",
          background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 10, padding: 4, marginBottom: 18,
        }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13 }}>⏳ Memuat outlets…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13 }}>
              {search ? `Gak ada outlet match "${search}"` : "Belum ada outlet terdaftar"}
            </div>
          ) : filtered.map(o => (
            <button
              key={o.code}
              onClick={() => setSelected(o.code)}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 2,
                background: selected === o.code ? `${accent}1f` : "transparent",
                border: selected === o.code ? `1px solid ${accent}88` : "1px solid transparent",
                borderRadius: 8, cursor: "pointer", fontFamily: "inherit", color: "#fff",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => { if (selected !== o.code) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
              onMouseLeave={(e) => { if (selected !== o.code) e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {o.vertical === "cinema" ? "🎬 " : o.vertical === "hybrid" ? "🌐 " : "🍦 "}{o.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3, fontFamily: "'Geist Mono',monospace" }}>
                    {o.code}{o.area ? ` · ${o.area}` : ""}{o.address ? ` · ${o.address}` : ""}
                  </div>
                </div>
                {selected === o.code && <span style={{ color: accent, fontSize: 18, flexShrink: 0 }}>✓</span>}
              </div>
            </button>
          ))}
        </div>

        {/* Confirm CTA */}
        <button
          onClick={confirm}
          disabled={!selected}
          style={{
            width: "100%", padding: "14px 20px",
            background: selected ? `linear-gradient(135deg, ${accent}, ${accent}cc)` : "rgba(255,255,255,0.06)",
            border: "none", borderRadius: 12,
            color: selected ? "#fff" : "#64748b",
            fontSize: 15, fontWeight: 900, cursor: selected ? "pointer" : "not-allowed",
            fontFamily: "inherit", letterSpacing: 0.4,
            boxShadow: selected ? `0 12px 32px ${accent}55` : "none",
            transition: "all 0.2s ease",
          }}>
          {selected ? "✓ Bind Device ke Outlet Ini" : "Pilih outlet dulu…"}
        </button>

        <div style={{ marginTop: 14, fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
          💡 Setting ini disimpan permanent di device. Untuk ganti outlet, hubungi Admin atau klik logo 5× di header.
        </div>
      </div>
    </div>
  );
}
