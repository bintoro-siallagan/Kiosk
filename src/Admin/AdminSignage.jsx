// src/Admin/AdminSignage.jsx
// Digital Signage CMS — layar & konten media.

import { useState, useEffect, useCallback } from "react";

const AC = "#9333ea";
const TYPE_ICON = { Image: "🖼️", Video: "🎬", Banner: "🪧", Promo: "🏷️" };
const SCREEN_ICON = { "TV Menu": "📺", "Second Display": "🖥️", "Kiosk Media": "🖲️" };
const MST = { active: "#10b981", scheduled: "#f59e0b", inactive: "#5b6470" };

export default function AdminSignage({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", media_type: "Image", duration_sec: "15", channel: "TV Menu" });

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

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Digital Signage…</div>;
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
        <Kpi label="Media Aktif" v={String(s.active_media)} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Screens */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🖥️ LAYAR — {d.screens.length} · klik buat toggle online</div>
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
          </div>
        ))}
      </div>
    </div>
  );
}

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
