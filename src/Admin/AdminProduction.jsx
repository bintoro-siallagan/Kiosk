// src/Admin/AdminProduction.jsx
// Production / Central Kitchen — production order.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#9a3412";
const ST = { planned: { c: "#3b82f6", l: "PLANNED" }, in_progress: { c: "#f59e0b", l: "IN PROGRESS" }, completed: { c: "#10b981", l: "COMPLETED" } };
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";

export default function AdminProduction({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/production`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const act = (o, path, okMsg) => {
    fetch(`${apiBase}/api/production/${o.id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg(j)); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = () => {
    if (!editing) return;
    const body = {
      order_no: editing.order_no,
      product_name: editing.product_name,
      output_qty: Number(editing.output_qty),
      output_unit: editing.output_unit,
      status: editing.status,
      produced_by: editing.produced_by || "",
    };
    fetch(`${apiBase}/api/production/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ " + editing.order_no + " diperbarui"); setEditing(null); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const remove = async (o) => {
    const ok = await confirm({ title: "Hapus Production Order?", message: `Hapus ${o.order_no} — ${o.product_name}?`, danger: true, okLabel: "Hapus" });
    if (!ok) return;
    fetch(`${apiBase}/api/production/${o.id}`, { method: "DELETE" })
      .then(r => r.json()).then(j => {
        if (j.ok) { setMsg("✓ " + o.order_no + " dihapus"); load(); }
        else setMsg(j.error || "gagal");
      }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Production…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🏭 <b style={{ color: "#fb923c" }}>PRODUCTION / CENTRAL KITCHEN</b> — production order untuk semi-
        finished &amp; finished goods. Selesai → bahan baku otomatis terkonsumsi dari gudang.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Order" v={String(s.total)} c={AC} />
        <Kpi label="Planned" v={String(s.planned)} c="#3b82f6" />
        <Kpi label="In Progress" v={String(s.in_progress)} c="#f59e0b" />
        <Kpi label="Output Selesai" v={s.output_completed + " unit"} c="#10b981" />
      </div>
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🍳 PRODUCTION ORDER — {d.orders.length}</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {d.orders.map(o => {
            const st = ST[o.status] || ST.planned;
            return (
              <div key={o.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                      {o.product_name} <span style={{ color: "#fb923c", fontFamily: "'Geist Mono',monospace" }}>· {o.output_qty} {o.output_unit}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                      {o.order_no}{o.completed_at ? ` · selesai ${fmtDate(o.completed_at)}` : ""}{o.produced_by ? ` · ${o.produced_by}` : ""}
                    </div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 9px", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                  {o.status === "planned" && <button onClick={() => act(o, "start", () => `✓ ${o.product_name} dimulai`)} style={S.btn("#f59e0b")}>▶ Mulai</button>}
                  {o.status === "in_progress" && <button onClick={() => act(o, "complete", j => `✓ Produksi selesai — ${j.materials_consumed} bahan terkonsumsi`)} style={S.btn("#10b981")}>✓ Selesai</button>}
                  <button onClick={() => setEditing({ ...o })} title="Edit" style={S.btnEdit}>✏️</button>
                  <button onClick={() => remove(o)} title="Hapus" style={S.btnDel}>🗑️</button>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>BAHAN:</span>
                  {o.materials.map((m, i) => (
                    <span key={i} style={{ fontSize: 11, color: "#9da7b3", background: "#0d1117", border: "1px solid #161b22", borderRadius: 5, padding: "2px 8px" }}>
                      {m.name} <b style={{ color: "#cdd5df", fontFamily: "'Geist Mono',monospace" }}>{m.qty} {m.unit}</b>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.order_no || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={S.lab}>Order No
                <input value={editing.order_no || ""} onChange={e => setEditing({ ...editing, order_no: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>Nama Produk
                <input value={editing.product_name || ""} onChange={e => setEditing({ ...editing, product_name: e.target.value })} style={modalInp} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={S.lab}>Output Qty
                  <input type="number" value={editing.output_qty || 0} onChange={e => setEditing({ ...editing, output_qty: e.target.value })} style={modalInp} />
                </label>
                <label style={S.lab}>Unit
                  <input value={editing.output_unit || ""} onChange={e => setEditing({ ...editing, output_unit: e.target.value })} style={modalInp} />
                </label>
              </div>
              <label style={S.lab}>Status
                <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="planned">planned</option>
                  <option value="in_progress">in_progress</option>
                  <option value="completed">completed</option>
                </select>
              </label>
              <label style={S.lab}>Diproduksi Oleh
                <input value={editing.produced_by || ""} onChange={e => setEditing({ ...editing, produced_by: e.target.value })} style={modalInp} />
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
  btn: (c) => ({ background: c, color: "#0a0e16", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }),
  btnEdit: { background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b55", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "#ef444422", color: "#ef4444", border: "1px solid #ef444455", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  lab: { display: "grid", gap: 4, fontSize: 11, color: "#9ca3af", fontWeight: 600 },
};
