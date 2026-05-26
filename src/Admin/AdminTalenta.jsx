// src/Admin/AdminTalenta.jsx
// Talenta Integration — sync attendance/shift/payroll/incentive
// dengan Talenta by Mekari.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const ago = (ts) => {
  if (!ts) return "belum pernah";
  const m = Math.floor((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "baru saja";
  if (m < 60) return m + " menit lalu";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " jam lalu";
  return Math.floor(h / 24) + " hari lalu";
};

export default function AdminTalenta({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/talenta/sync`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const sync = (entity) => {
    if (busy) return;
    setBusy(entity); setMsg("");
    fetch(`${apiBase}/api/talenta/sync`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ Sync ${entity === "all" ? "semua entitas" : entity} — ${j.records} record`); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e))).finally(() => setBusy(""));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/talenta/${editing.key}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus entitas "${item.name || item.key}"?`, message: "Status sync untuk entitas ini akan dihapus. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/talenta/${item.key}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Talenta Integration…</div>;
  const c = d.connection, s = d.summary;
  const connected = c.status === "connected";

  return (
    <div>
      <div style={S.intro}>
        🔗 <b style={{ color: "#0ea5e9" }}>TALENTA INTEGRATION</b> — sinkronisasi <b>attendance, shift,
        payroll &amp; incentive</b> dengan <b>Talenta by Mekari</b>. Data HR &amp; payroll konsisten lintas sistem.
      </div>

      {/* Connection */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 30 }}>🔗</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{c.provider}</div>
          <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>workspace: {c.workspace} · {c.mode}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, fontFamily: "'Geist Mono',monospace",
          color: connected ? "#10b981" : "#f59e0b", background: (connected ? "#10b981" : "#f59e0b") + "1f",
          border: `1px solid ${(connected ? "#10b981" : "#f59e0b")}55` }}>
          {connected ? "● CONNECTED" : "● SANDBOX"}
        </span>
        <button onClick={() => sync("all")} disabled={!!busy} style={S.btnPrimary}>
          {busy === "all" ? "Sinkronisasi…" : "🔄 Sync Semua"}
        </button>
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={S.kpiRow}>
        <Kpi label="Entitas Sync" v={String(s.entity_count)} c="#0ea5e9" />
        <Kpi label="Total Record" v={s.total_records.toLocaleString("id-ID")} c="#3b82f6" />
        <Kpi label="Synced" v={`${s.synced}/${s.entity_count}`} c="#10b981" />
        <Kpi label="Sync Terakhir" v={ago(s.last_sync)} c="#a855f7" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* Entities */}
        <div style={S.card}>
          <div style={S.kicker}>📦 ENTITAS SINKRONISASI</div>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {d.entities.map(e => (
              <div key={e.key} style={{ display: "flex", alignItems: "center", gap: 12, background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
                <span style={{ fontSize: 24 }}>{e.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{e.name}</div>
                  <div style={{ fontSize: 11, color: "#5b6470" }}>{e.desc} · sync {ago(e.last_sync)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6", fontFamily: "'Geist Mono',monospace" }}>{e.record_count}</div>
                  <div style={{ fontSize: 9, color: "#5b6470" }}>record</div>
                </div>
                <button onClick={() => sync(e.key)} disabled={!!busy} style={S.btnSm}>
                  {busy === e.key ? "…" : "🔄 Sync"}
                </button>
                <button onClick={() => setEditing({ ...e })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(e)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            ))}
          </div>
        </div>

        {/* Sync log */}
        <div style={S.card}>
          <div style={S.kicker}>📜 LOG SINKRONISASI</div>
          {d.log.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5b6470", padding: "12px 0" }}>No aktivitas sync.</div>
          ) : d.log.map((l, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "7px 0", borderTop: i ? "1px solid #161b22" : "none" }}>
              <span style={{ color: "#9da7b3" }}>🔄 {l.entity}</span>
              <span style={{ color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{l.records} rec · {ago(l.at)}</span>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.name || editing.key}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Entitas (read-only)
                <input value={editing.key || ""} readOnly style={{ ...modalInp, opacity: 0.6 }} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status Sync
                <select value={editing.status || "idle"} onChange={ev => setEditing({ ...editing, status: ev.target.value })} style={modalInp}>
                  <option value="idle">idle</option>
                  <option value="synced">synced</option>
                  <option value="syncing">syncing</option>
                  <option value="error">error</option>
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Record Count
                <input type="number" value={editing.record_count ?? 0} onChange={ev => setEditing({ ...editing, record_count: Number(ev.target.value) })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Last Sync (epoch detik)
                <input type="number" value={editing.last_sync ?? 0} onChange={ev => setEditing({ ...editing, last_sync: Number(ev.target.value) })} style={modalInp} />
              </label>
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

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginTop: 14 },
  btnPrimary: { background: "#0ea5e9", color: "#04141f", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnSm: { background: "#0ea5e91f", border: "1px solid #0ea5e955", color: "#38bdf8", fontSize: 11, fontWeight: 700, padding: "6px 11px", borderRadius: 6, cursor: "pointer", fontFamily: "'Geist Mono',monospace", whiteSpace: "nowrap" },
};
