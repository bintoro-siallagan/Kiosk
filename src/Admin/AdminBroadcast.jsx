/**
 * AdminBroadcast.jsx — Push Promo ke semua layar (signage, POS, kiosk, QR order).
 * Tab di AdminTools. Endpoint: /api/broadcast
 *
 * Props: apiBase — HOST backend.
 */
import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const MONO = "'Geist Mono',monospace";
const ACCENTS = ["#f97316", "#ef4444", "#10b981", "#3b82f6", "#a855f7", "#eab308"];
const DURATIONS = [[30, "30 min"], [60, "1 hr"], [120, "2 hr"], [0, "Sampai distop"]];
const TEMPLATES = [
  { label: "⚡ Flash Sale", title: "FLASH SALE 30 MENIT!", message: "Diskon kilat semua menu — buruan sebelum kehabisan!", code: "FLASH30", accent: "#ef4444" },
  { label: "🕐 Happy Hour", title: "HAPPY HOUR ⏰", message: "Beli 2 gratis 1 — khusus hr ini aja!", code: "HAPPY", accent: "#f97316" },
  { label: "🌧️ Promo Sepi", title: "Lagi sepi? Rezeki kamu!", message: "Diskon 20% buat 20 pembeli berikutnya", code: "REZEKI20", accent: "#3b82f6" },
  { label: "🍦 Menu Baru", title: "COBAIN MENU BARU 🍦", message: "Menu baru, harga perkenalan spesial day ini", code: "", accent: "#a855f7" },
];

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 18, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, fontFamily: MONO },
  input: { width: "100%", background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  chip: (on, c = "#3B82F6") => ({ background: on ? c + "22" : "transparent", border: `1px solid ${on ? c + "88" : "#21262d"}`, borderRadius: 8, padding: "7px 12px", color: on ? c : "#8b949e", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
};

export default function AdminBroadcast({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [code, setCode] = useState("");
  const [accent, setAccent] = useState("#f97316");
  const [duration, setDuration] = useState(60);
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");

  const reload = useCallback(() => {
    fetch(`${apiBase}/api/broadcast/active`).then(r => r.json()).then(d => setActive(d.active || null)).catch(() => {});
    fetch(`${apiBase}/api/broadcast/history`).then(r => r.json()).then(d => setHistory(Array.isArray(d) ? d : [])).catch(() => {});
  }, [apiBase]);
  useEffect(() => { reload(); }, [reload]);

  const applyTemplate = (t) => { setTitle(t.title); setMessage(t.message); setCode(t.code); setAccent(t.accent); };

  const push = async () => {
    if (!title.trim()) { alert("Judul promo required"); return; }
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/api/broadcast`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, code, accent, duration_min: duration, created_by: localStorage.getItem("adminName") || "admin" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { alert(d.error || "Gagal push promo"); setBusy(false); return; }
      alert("🚀 Promo ke-push to semua layar!");
      reload();
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  const stop = async () => {
    await fetch(`${apiBase}/api/broadcast/stop`, { method: "POST" });
    reload();
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/broadcast/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); reload(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.title || '#' + item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/broadcast/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); reload(); }
    else setMsg(j.error || "gagal");
  };

  return (
    <div>
      <div style={{ ...S.card, background: "#0a1422", border: "1px solid #15324d" }}>
        <div style={{ ...S.label, color: "#5fa8d3" }}>📣 Push Promo Broadcast</div>
        <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>
          Outlet lagi sepi? Set promo kilat di sini → langsung tayang real-time di <b>digital signage, POS, kiosk & QR order</b>. Layar nge-refresh tiap ~20 detik.
        </div>
      </div>

      {/* ACTIVE */}
      {active ? (
        <div style={{ ...S.card, borderLeft: `4px solid ${active.accent || "#f97316"}` }}>
          <div style={S.label}>🟢 Sedang Showing</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: active.accent || "#f97316" }}>{active.title}</div>
          {active.message && <div style={{ fontSize: 13, color: "#c9d1d9", marginTop: 3 }}>{active.message}</div>}
          {active.code && <div style={{ fontSize: 12, color: "#8b949e", marginTop: 3, fontFamily: MONO }}>Kode: {active.code}</div>}
          <button onClick={stop} style={{ marginTop: 12, background: "#F8717118", border: "1px solid #F8717144", borderRadius: 8, padding: "9px 16px", color: "#F87171", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            ⏹ Stop Broadcast
          </button>
        </div>
      ) : (
        <div style={{ ...S.card, color: "#555", fontSize: 13 }}>No promo yang tayang.</div>
      )}

      {/* COMPOSE */}
      <div style={S.card}>
        <div style={S.label}>Template Cepat</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {TEMPLATES.map(t => (
            <button key={t.label} onClick={() => applyTemplate(t)} style={S.chip(false)}>{t.label}</button>
          ))}
        </div>

        <div style={S.label}>Judul Promo *</div>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="mis. FLASH SALE 30 MENIT!" style={{ ...S.input, marginBottom: 12 }} />

        <div style={S.label}>Pesan</div>
        <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Detail promo singkat..." style={{ ...S.input, marginBottom: 12 }} />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={S.label}>Kode Promo (opsional)</div>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="FLASH30" style={S.input} />
          </div>
        </div>

        <div style={S.label}>Warna Aksen</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {ACCENTS.map(c => (
            <button key={c} onClick={() => setAccent(c)} style={{
              width: 32, height: 32, borderRadius: 8, background: c, cursor: "pointer",
              border: accent === c ? "3px solid #fff" : "1px solid #21262d",
            }} />
          ))}
        </div>

        <div style={S.label}>Durasi</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {DURATIONS.map(([m, l]) => (
            <button key={m} onClick={() => setDuration(m)} style={S.chip(duration === m)}>{l}</button>
          ))}
        </div>

        <button onClick={push} disabled={busy} style={{
          width: "100%", background: busy ? "#374151" : accent, color: "#fff", border: "none",
          borderRadius: 10, padding: "14px", fontSize: 16, fontWeight: 800, cursor: busy ? "default" : "pointer", fontFamily: "inherit",
        }}>
          {busy ? "Sending…" : "🚀 Push to Semua Layar"}
        </button>
      </div>

      {/* HISTORY */}
      <div style={S.card}>
        <div style={S.label}>Riwayat Broadcast ({history.length})</div>
        {history.length === 0 ? (
          <div style={{ color: "#555", fontSize: 13, padding: 6 }}>No</div>
        ) : history.map(h => (
          <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #0f1629" }}>
            <span style={{ width: 8, height: 8, borderRadius: 8, background: h.accent || "#f97316", flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: "#c9d1d9" }}>{h.title}{h.code ? ` · ${h.code}` : ""}</span>
            <span style={{ fontSize: 11, color: "#555", fontFamily: MONO }}>{new Date((h.created_at || 0) * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <button onClick={() => setEditing({ ...h })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(h)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Judul</div>
                <input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Pesan</div>
                <input value={editing.message || ""} onChange={e => setEditing({ ...editing, message: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Kode Promo</div>
                <input value={editing.code || ""} onChange={e => setEditing({ ...editing, code: e.target.value.toUpperCase() })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Warna Aksen</div>
                <input value={editing.accent || ""} onChange={e => setEditing({ ...editing, accent: e.target.value })} placeholder="#f97316" style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Status</div>
                <select value={editing.active ? 1 : 0} onChange={e => setEditing({ ...editing, active: Number(e.target.value) })} style={modalInp}>
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
