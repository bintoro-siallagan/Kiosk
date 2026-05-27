// src/Admin/AdminSignage.jsx
// Digital Signage CMS — layar & konten media.

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState, EmptyState } from "../components/uiKit.jsx";

const AC = "#9333ea";
const MEDIA_STATUSES = ["active", "scheduled", "inactive"];
const TYPE_ICON = { Image: "🖼️", Video: "🎬", Banner: "🪧", Promo: "🏷️" };
const SCREEN_ICON = { "TV Menu": "📺", "Second Display": "🖥️", "Kiosk Media": "🖲️" };
const MST = { active: "#10b981", scheduled: "#f59e0b", inactive: "#5b6470" };

export default function AdminSignage({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", media_type: "Image", duration_sec: "15", channel: "TV Menu" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/signage`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (path, body, okMsg) => {
    fetch(`${apiBase}/api/signage/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : "{}",
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const addMedia = () => {
    if (!form.title.trim()) { setMsg("⚠ Judul media wajib"); return; }
    post("media", { ...form, duration_sec: Number(form.duration_sec) }, "✓ Media ditambah");
    setForm({ ...form, title: "" });
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/signage/media/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.title || '#' + item.id}"?`,
      message: "Media akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/signage/media/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <LoadingState label="Memuat Digital Signage…" />;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📺 <b style={{ color: "#c084fc" }}>DIGITAL SIGNAGE CMS</b> — kelola layar (TV menu board, second
        display, kiosk media) &amp; konten media (image, video, banner, promo) per channel.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Layar" v={String(s.screens)} c={AC} />
        <Kpi label="Layar Online" v={`${s.online}/${s.screens}`} c="#10b981" />
        <Kpi label="Total Media" v={String(s.media)} c="#3b82f6" />
        <Kpi label="Media Active" v={String(s.active_media)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Screens */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🖥️ LAYAR — {d.screens.length} · klik buat toggle online</div>
        {d.screens.length === 0 ? (
          <EmptyState icon="📺" title="Belum ada layar terdaftar" desc="Register device dengan buka /?signage&device=CODE di tablet/TV signage untuk muncul di sini." />
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10, marginTop: 10 }}>
          {d.screens.map(sc => {
            const on = sc.status === "online";
            return (
              <div key={sc.id} onClick={() => post(`screen/${sc.id}/toggle`, null, `✓ ${sc.outlet} ${on ? "offline" : "online"}`)}
                style={{ background: "#0a0e16", border: `1px solid ${on ? "#10b98144" : "#161b22"}`, borderRadius: 9, padding: "11px 13px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 17 }}>{SCREEN_ICON[sc.screen_type] || "📺"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>{sc.outlet}</div>
                    <div style={{ fontSize: 10, color: "#5b6470" }}>{sc.name} · {sc.screen_type}</div>
                  </div>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#10b981" : "#5b6470" }} />
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, color: on ? "#10b981" : "#5b6470", fontFamily: "'Geist Mono',monospace", marginTop: 6 }}>
                  {on ? "● ONLINE" : "○ OFFLINE"}
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {/* Media */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🎬 MEDIA LIBRARY — {d.media.length}</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.9fr 1.2fr auto", gap: 8, margin: "10px 0 12px" }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul media" style={S.input} />
          <select value={form.media_type} onChange={e => setForm({ ...form, media_type: e.target.value })} style={S.input}>
            {d.media_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.duration_sec} onChange={e => setForm({ ...form, duration_sec: e.target.value })} placeholder="Durasi (s)" type="number" style={S.input} />
          <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} style={S.input}>
            {d.channels.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={addMedia} style={S.btn}>+ Media</button>
        </div>
        {d.media.length === 0 && <EmptyState icon="🎞️" title="Belum ada media" desc="Klik '+ Media' untuk upload gambar/video/poster ke playlist signage." />}
        {d.media.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
            <span style={{ fontSize: 16 }}>{TYPE_ICON[m.media_type] || "📄"}</span>
            <span style={{ flex: 1, color: "#e6edf3", fontWeight: 600 }}>{m.title}</span>
            <span style={{ width: 100, color: "#5b6470", fontSize: 11 }}>{m.channel}</span>
            <span style={{ width: 50, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{m.duration_sec}s</span>
            <button onClick={() => post(`media/${m.id}/toggle`, null, `✓ ${m.title} di-toggle`)}
              style={{ width: 90, fontSize: 10, fontWeight: 700, color: MST[m.status], background: MST[m.status] + "1f", border: `1px solid ${MST[m.status]}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
              {m.status.toUpperCase()}
            </button>
            <button onClick={() => setEditing({ ...m })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(m)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={modalLbl}>Judul</label>
                <input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={modalLbl}>Tipe Media</label>
                  <select value={editing.media_type || ""} onChange={e => setEditing({ ...editing, media_type: e.target.value })} style={modalInp}>
                    {(d.media_types || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={modalLbl}>Channel</label>
                  <select value={editing.channel || ""} onChange={e => setEditing({ ...editing, channel: e.target.value })} style={modalInp}>
                    {(d.channels || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={modalLbl}>Durasi (sec)</label>
                  <input type="number" value={editing.duration_sec ?? 0} onChange={e => setEditing({ ...editing, duration_sec: Number(e.target.value) })} style={modalInp} />
                </div>
                <div>
                  <label style={modalLbl}>Status</label>
                  <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                    {MEDIA_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
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
const modalLbl = { fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4, display: "block", marginBottom: 4 };

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#9333ea", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
