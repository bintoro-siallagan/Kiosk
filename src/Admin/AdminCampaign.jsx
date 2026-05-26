// src/Admin/AdminCampaign.jsx
// Realtime Campaign Engine + Event/Weather Impact Analytics.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#fb7185";
const ago = (ts) => {
  if (!ts) return "—";
  const h = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (h < 1) return "baru saja";
  if (h < 24) return h + " hr lalu";
  return Math.floor(h / 24) + " day lalu";
};

export default function AdminCampaign({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ name: "", message: "", channels: [] });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/campaign-impact`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const toggleCh = (id) => setForm(f => ({
    ...f, channels: f.channels.includes(id) ? f.channels.filter(c => c !== id) : [...f.channels, id],
  }));
  const launch = () => {
    if (!form.name.trim()) { setMsg("⚠ Nama campaign wajib"); return; }
    if (!form.channels.length) { setMsg("⚠ Pilih minimal 1 channel"); return; }
    fetch(`${apiBase}/api/campaign-impact/launch`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Campaign live — terkirim to " + j.channels.length + " channel"); setForm({ name: "", message: "", channels: [] }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const payload = { ...editing };
    if (!Array.isArray(payload.channels)) {
      try { payload.channels = JSON.parse(payload.channels || "[]"); } catch { payload.channels = []; }
    }
    const r = await fetch(`${apiBase}/api/campaign-impact/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.name || '#' + item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/campaign-impact/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };
  const toggleEditCh = (id) => {
    const cur = Array.isArray(editing.channels) ? editing.channels : [];
    setEditing({ ...editing, channels: cur.includes(id) ? cur.filter(c => c !== id) : [...cur, id] });
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Campaign Center…</div>;
  const im = d.impact, s = d.summary;
  const chMap = Object.fromEntries(d.channels.map(c => [c.id, c]));

  return (
    <div>
      <div style={S.intro}>
        📡 <b style={{ color: AC }}>REALTIME CAMPAIGN &amp; EVENT IMPACT</b> — push campaign realtime ke
        signage, second display, QR, kiosk &amp; loyalty + analisis dampak weekend/payday ke sales.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Campaign Live" v={String(s.live_campaigns)} c={AC} sub={`${s.total_campaigns} total`} />
        <Kpi label="Channel Active" v={String(s.channels)} c="#a855f7" sub="touchpoint" />
        <Kpi label="Weekend Uplift" v={(im.weekend_uplift > 0 ? "+" : "") + im.weekend_uplift + "%"} c={im.weekend_uplift > 0 ? "#10b981" : "#f59e0b"} sub="vs weekday" />
        <Kpi label="Payday Uplift" v={im.payday_uplift == null ? "—" : (im.payday_uplift > 0 ? "+" : "") + im.payday_uplift + "%"} c="#3b82f6" sub={im.payday_uplift == null ? "data belum cukup" : "vs day biasa"} />
      </div>

      {/* Event impact */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🌦️ EVENT IMPACT ANALYSIS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <div style={S.sub}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3", marginBottom: 8 }}>📅 Weekend vs Weekday</div>
            <Row label="Weekend" v={`${im.weekend.orders_per_day} order/day`} c="#fbbf24" />
            <Row label="Weekday" v={`${im.weekday.orders_per_day} order/day`} c="#22d3ee" />
            <div style={{ fontSize: 11, color: "#9da7b3", marginTop: 6, lineHeight: 1.5 }}>
              {im.weekend_uplift > 5 ? "Weekend ramai — perkuat with family campaign."
                : im.weekend_uplift < -5 ? "Weekend justru sepi — peluang weekend promo."
                : "Weekend ≈ weekday — belum ada pola kuat, bisa didorong campaign."}
            </div>
          </div>
          <div style={S.sub}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3", marginBottom: 8 }}>💰 Payday Window (tgl 25–2)</div>
            {im.payday_uplift == null ? (
              <div style={{ fontSize: 12, color: "#5b6470", padding: "6px 0" }}>No transaksi di window payday pada rentang data ini — analisis aktif begitu data bertambah.</div>
            ) : (
              <>
                <Row label="Payday" v={`${im.payday.orders_per_day} order/day`} c="#10b981" />
                <Row label="Hari biasa" v={`${im.normal.orders_per_day} order/day`} c="#9ca3af" />
              </>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#5b6470", marginTop: 10 }}>ℹ️ {im.weather_note}</div>
      </div>

      {/* Channels */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📺 CHANNEL TOUCHPOINT</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 10, marginTop: 10 }}>
          {d.channels.map(c => (
            <div key={c.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 22 }}>{c.icon}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3", marginTop: 3 }}>{c.name}</div>
              <div style={{ fontSize: 10, color: "#5b6470" }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Compose */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🚀 LUNCURKAN CAMPAIGN</div>
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama campaign *" style={S.input} />
          <input value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Pesan campaign" style={S.input} />
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {d.channels.map(c => {
              const on = form.channels.includes(c.id);
              return (
                <button key={c.id} onClick={() => toggleCh(c.id)}
                  style={{ background: on ? AC : "#0a0e16", border: `1px solid ${on ? AC : "#21262d"}`, color: on ? "#fff" : "#9da7b3", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>
                  {c.icon} {c.name}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={launch} style={S.btnLaunch}>🚀 Launch Realtime</button>
            {msg ? <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</span> : null}
          </div>
        </div>
      </div>

      {/* Campaign list */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 CAMPAIGN — {d.campaigns.length}</div>
        {d.campaigns.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderTop: "1px solid #161b22" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                {c.name}
                <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 8, color: c.status === "live" ? "#10b981" : "#5b6470" }}>
                  {c.status === "live" ? "● LIVE" : "○ ENDED"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: "#5b6470" }}>{c.message || "—"} · {ago(c.launched_at)}</div>
            </div>
            <div style={{ fontSize: 14 }}>
              {(c.channels || []).map((id, i) => <span key={i} title={(chMap[id] || {}).name}>{(chMap[id] || {}).icon}</span>)}
            </div>
            <button onClick={() => setEditing({ ...c, channels: Array.isArray(c.channels) ? [...c.channels] : [] })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
            <button onClick={() => remove(c)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.name || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Nama Campaign</div>
                <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Pesan</div>
                <input value={editing.message || ""} onChange={e => setEditing({ ...editing, message: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Status</div>
                <select value={editing.status || "live"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="live">live</option>
                  <option value="ended">ended</option>
                  <option value="paused">paused</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Channel</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {d.channels.map(ch => {
                    const on = (editing.channels || []).includes(ch.id);
                    return (
                      <button key={ch.id} onClick={() => toggleEditCh(ch.id)} style={{ background: on ? AC : "#0a0e16", border: `1px solid ${on ? AC : "#30363d"}`, color: on ? "#fff" : "#9da7b3", fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}>{ch.icon} {ch.name}</button>
                    );
                  })}
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

function Row({ label, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
      <span style={{ color: "#9da7b3" }}>{label}</span>
      <span style={{ color: c, fontWeight: 700, fontFamily: "'Geist Mono',monospace" }}>{v}</span>
    </div>
  );
}
function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  sub: { background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "9px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none" },
  btnLaunch: { background: "#fb7185", color: "#1a0810", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
