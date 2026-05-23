// src/Admin/AdminStockOpname.jsx
// Stock Opname — hitung fisik stok vs sistem.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0891b2";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminStockOpname({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [selId, setSelId] = useState(null);
  const [counts, setCounts] = useState({});
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/stock-opname`).then(r => r.json()).then(j => {
      setD(j);
      setSelId(prev => prev || (j.sessions[0] && j.sessions[0].id));
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const sel = d && (d.sessions.find(s => s.id === selId) || d.sessions[0]);
  useEffect(() => {
    if (sel) { const c = {}; sel.items.forEach(it => { c[it.sku] = it.counted_qty == null ? "" : String(it.counted_qty); }); setCounts(c); }
  }, [selId, d]); // eslint-disable-line

  const saveCount = (sku, val) => {
    if (val === "" || !sel || sel.status !== "in_progress") return;
    fetch(`${apiBase}/api/stock-opname/${sel.id}/count`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku, counted_qty: Number(val) }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };
  const act = (path, okMsg) => {
    fetch(`${apiBase}/api/stock-opname/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok || j.id) { setMsg(okMsg(j)); if (j.id) setSelId(j.id); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = () => {
    if (!editing) return;
    const body = {
      opname_no: editing.opname_no,
      location: editing.location,
      status: editing.status,
      started_by: editing.started_by || "",
    };
    fetch(`${apiBase}/api/stock-opname/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ " + editing.opname_no + " diperbarui"); setEditing(null); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const remove = async (sess) => {
    const ok = await confirm({ title: "Hapus sesi opname?", message: `Hapus ${sess.opname_no}? Tindakan ini tidak dapat dibatalkan.`, danger: true, okLabel: "Hapus" });
    if (!ok) return;
    fetch(`${apiBase}/api/stock-opname/${sess.id}`, { method: "DELETE" })
      .then(r => r.json()).then(j => {
        if (j.ok) {
          setMsg("✓ " + sess.opname_no + " dihapus");
          if (selId === sess.id) setSelId(null);
          load();
        } else setMsg(j.error || "gagal");
      }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Stock Opname…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📋 <b style={{ color: "#22d3ee" }}>STOCK OPNAME</b> — hitung fisik stok vs sistem. Selisih dicatat,
        penyesuaian otomatis ter-posting ke gudang saat sesi diselesaikan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Sesi" v={String(s.total)} c={AC} />
        <Kpi label="Sedang Berjalan" v={String(s.in_progress)} c={s.in_progress > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Selesai" v={String(s.completed)} c="#10b981" />
        <Kpi label="Selisih Terakhir" v={fmtRp(s.last_variance)} c={s.last_variance === 0 ? "#10b981" : "#ef4444"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={S.kicker}>📦 SESI:</span>
          {d.sessions.map(x => (
            <button key={x.id} onClick={() => setSelId(x.id)} style={{ ...S.chip, ...(x.id === (sel && sel.id) ? { background: AC, border: `1px solid ${AC}`, color: "#fff" } : {}) }}>
              {x.opname_no} {x.status === "in_progress" ? "●" : "✓"}
            </button>
          ))}
          <button onClick={() => act("", j => `✓ Sesi opname baru dibuat`)} style={{ ...S.chip, color: "#22d3ee", border: "1px solid #0891b255" }}>+ Sesi Baru</button>
          {msg ? <span style={{ marginLeft: "auto", fontSize: 12, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</span> : null}
        </div>
      </div>

      {sel && (
        <div style={{ ...S.card, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={S.kicker}>{sel.opname_no} · {sel.location} — {sel.counted}/{sel.total} dihitung</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontFamily: "'Geist Mono',monospace" }}>
                Selisih nilai: <b style={{ color: sel.variance_value === 0 ? "#10b981" : "#ef4444" }}>{fmtRp(sel.variance_value)}</b>
              </span>
              <button onClick={() => setEditing({ ...sel })} title="Edit" style={S.btnEdit}>✏️</button>
              <button onClick={() => remove(sel)} title="Hapus" style={S.btnDel}>🗑️</button>
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
            <thead>
              <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
                {["SKU", "ITEM", "STOK SISTEM", "HITUNG FISIK", "SELISIH"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sel.items.map(it => {
                const cnt = counts[it.sku];
                const v = cnt === "" || cnt == null ? null : Number(cnt) - it.system_qty;
                return (
                  <tr key={it.sku} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                    <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#5b6470" }}>{it.sku}</td>
                    <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{it.name}</td>
                    <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{it.system_qty} {it.unit}</td>
                    <td style={S.td}>
                      {sel.status === "in_progress" ? (
                        <input value={cnt ?? ""} onChange={e => setCounts({ ...counts, [it.sku]: e.target.value })}
                          onBlur={e => saveCount(it.sku, e.target.value)} type="number" placeholder="—" style={S.input} />
                      ) : <span style={{ fontFamily: "'Geist Mono',monospace", color: "#9da7b3" }}>{it.counted_qty ?? "—"} {it.unit}</span>}
                    </td>
                    <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: v == null ? "#5b6470" : v === 0 ? "#10b981" : "#ef4444" }}>
                      {v == null ? "—" : v === 0 ? "✓ pas" : (v > 0 ? "+" : "") + v.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sel.status === "in_progress" && (
            <button onClick={() => act(`${sel.id}/complete`, j => `✓ Opname selesai — ${j.adjusted} item disesuaikan`)} style={{ ...S.btn, marginTop: 12 }}>
              🔒 Selesaikan Opname & Posting Penyesuaian
            </button>
          )}
        </div>
      )}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.opname_no || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={S.lab}>Opname No
                <input value={editing.opname_no || ""} onChange={e => setEditing({ ...editing, opname_no: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>Lokasi
                <input value={editing.location || ""} onChange={e => setEditing({ ...editing, location: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>Status
                <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                </select>
              </label>
              <label style={S.lab}>Dimulai Oleh
                <input value={editing.started_by || ""} onChange={e => setEditing({ ...editing, started_by: e.target.value })} style={modalInp} />
              </label>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

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
  td: { padding: "7px 8px" },
  chip: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#9da7b3", cursor: "pointer", fontFamily: "inherit" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 6, padding: "5px 8px", color: "#e6edf3", fontSize: 12, fontFamily: "'Geist Mono',monospace", outline: "none", width: 90 },
  btn: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnEdit: { background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b55", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "#ef444422", color: "#ef4444", border: "1px solid #ef444455", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  lab: { display: "grid", gap: 4, fontSize: 11, color: "#9ca3af", fontWeight: 600 },
};
