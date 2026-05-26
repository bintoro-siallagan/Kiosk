// src/Admin/AdminGoodsReceived.jsx
// Good Received — outlet konfirmasi terima barang → stok nambah.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#0e7490";
const ago = (ts) => {
  if (!ts) return "—";
  const h = Math.floor((Date.now() / 1000 - ts) / 3600);
  if (h < 1) return "baru saja";
  if (h < 24) return h + " jam lalu";
  return Math.floor(h / 24) + " hari lalu";
};

export default function AdminGoodsReceived({ apiBase = "" }) {
  const { confirm: confirmDlg } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/goods-received`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const confirm = (gr) => {
    if (busy) return;
    setBusy(gr.id); setMsg("");
    fetch(`${apiBase}/api/goods-received/${gr.id}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ received_by: "Outlet Manager" }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg(`✓ ${gr.gr_number} diterima — ${j.items_posted} item, stok ter-update`); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e))).finally(() => setBusy(null));
  };

  const saveEdit = () => {
    if (!editing) return;
    const body = {
      gr_number: editing.gr_number,
      gd_ref: editing.gd_ref || "",
      po_ref: editing.po_ref || "",
      outlet: editing.outlet,
      status: editing.status,
      has_discrepancy: editing.has_discrepancy ? 1 : 0,
      received_by: editing.received_by || "",
    };
    fetch(`${apiBase}/api/goods-received/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ " + editing.gr_number + " diperbarui"); setEditing(null); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const remove = async (gr) => {
    const ok = await confirmDlg({ title: "Hapus GR?", message: `Hapus ${gr.gr_number}? This action tidak dapat dibatalkan.`, danger: true, okLabel: "Delete" });
    if (!ok) return;
    fetch(`${apiBase}/api/goods-received/${gr.id}`, { method: "DELETE" })
      .then(r => r.json()).then(j => {
        if (j.ok) { setMsg("✓ " + gr.gr_number + " dihapus"); load(); }
        else setMsg(j.error || "gagal");
      }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Good Received…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📥 <b style={{ color: "#22d3ee" }}>GOOD RECEIVED</b> — outlet konfirmasi terima barang dari Good
        Delivery. Konfirmasi → <b>stok otomatis nambah</b> &amp; finance tarik GR ke purchase invoice.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Menunggu Diterima" v={String(s.pending)} c={s.pending > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="⚠ Outlet Lupa GR" v={String(s.overdue || 0)} c={s.overdue > 0 ? "#ef4444" : "#10b981"} sub="pending ≥ 3 hari" />
        <Kpi label="Ada Selisih" v={String(s.discrepancy)} c={s.discrepancy > 0 ? "#ef4444" : "#5b6470"} />
        <Kpi label="Sudah Diterima" v={String(s.received)} c="#10b981" />
      </div>
      {s.overdue > 0 && (
        <div style={{ ...S.card, marginTop: 10, borderColor: "#ef444455", background: "#1a0d0f" }}>
          <div style={{ fontSize: 13, color: "#fca5a5" }}>
            🚨 <b>{s.overdue} GR belum dikonfirmasi ≥ 3 hari</b> — outlet lupa konfirmasi terima.
            Stok belum masuk sistem &amp; finance belum bisa tarik invoice. Cek juga 🔔 Notification Center.
          </div>
        </div>
      )}
      {msg ? <div style={{ fontSize: 12, margin: "8px 2px", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      {/* Pending */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📦 MENUNGGU KONFIRMASI TERIMA — {d.pending.length}</div>
        {d.pending.length === 0 ? (
          <div style={{ fontSize: 12, color: "#10b981", padding: "10px 0" }}>✓ Semua barang sudah diterima.</div>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {d.pending.map(gr => (
              <div key={gr.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${gr.overdue ? "#ef4444" : "#f59e0b"}`, borderRadius: 9, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                      {gr.gr_number} <span style={{ color: "#5b6470", fontWeight: 400, fontSize: 11 }}>· {gr.outlet}</span>
                      {gr.overdue
                        ? <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: "#ef4444", background: "#ef444420", border: "1px solid #ef444455", borderRadius: 5, padding: "2px 7px", fontFamily: "'Geist Mono',monospace" }}>⚠ LUPA {gr.days_pending} HARI</span>
                        : gr.days_pending > 0 ? <span style={{ marginLeft: 8, fontSize: 9, color: "#f59e0b", fontFamily: "'Geist Mono',monospace" }}>pending {gr.days_pending} hari</span> : null}
                    </div>
                    <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{gr.gd_ref} · {gr.po_ref}</div>
                  </div>
                  <button onClick={() => confirm(gr)} disabled={busy === gr.id} style={S.btn}>
                    {busy === gr.id ? "Memproses…" : "✓ Konfirmasi Terima"}
                  </button>
                  <button onClick={() => setEditing({ ...gr })} title="Edit" style={S.btnEdit}>✏️</button>
                  <button onClick={() => remove(gr)} title="Delete" style={S.btnDel}>🗑️</button>
                </div>
                <div style={{ display: "grid", gap: 3 }}>
                  {gr.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9da7b3", padding: "2px 0" }}>
                      <span>{it.name} <span style={{ color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>· {it.sku}</span></span>
                      <span style={{ fontFamily: "'Geist Mono',monospace" }}>{it.qty_ordered} {it.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Received history */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 RIWAYAT GR — {d.received.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["GR NUMBER", "OUTLET", "ITEM", "DITERIMA OLEH", "WAKTU", "STATUS", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.received.map(gr => (
              <tr key={gr.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontFamily: "'Geist Mono',monospace", color: "#e6edf3", fontWeight: 600 }}>{gr.gr_number}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{gr.outlet}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{gr.items.length} item</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{gr.received_by}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{ago(gr.received_at)}</td>
                <td style={S.td}>
                  {gr.has_discrepancy
                    ? <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 11 }}>⚠ ADA SELISIH</span>
                    : <span style={{ color: "#10b981", fontWeight: 700, fontSize: 11 }}>✓ SESUAI</span>}
                </td>
                <td style={S.td}>
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    <button onClick={() => setEditing({ ...gr })} title="Edit" style={S.btnEdit}>✏️</button>
                    <button onClick={() => remove(gr)} title="Delete" style={S.btnDel}>🗑️</button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.gr_number || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={S.lab}>GR Number
                <input value={editing.gr_number || ""} onChange={e => setEditing({ ...editing, gr_number: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>GD Ref
                <input value={editing.gd_ref || ""} onChange={e => setEditing({ ...editing, gd_ref: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>PO Ref
                <input value={editing.po_ref || ""} onChange={e => setEditing({ ...editing, po_ref: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>Outlet
                <input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} />
              </label>
              <label style={S.lab}>Status
                <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="pending">pending</option>
                  <option value="received">received</option>
                </select>
              </label>
              <label style={S.lab}>Diterima Oleh
                <input value={editing.received_by || ""} onChange={e => setEditing({ ...editing, received_by: e.target.value })} style={modalInp} />
              </label>
              <label style={{ ...S.lab, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={!!editing.has_discrepancy} onChange={e => setEditing({ ...editing, has_discrepancy: e.target.checked })} />
                <span>Ada selisih (discrepancy)</span>
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

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

function Kpi({ label, v, c, sub }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", margin: "4px 0 2px" }}>{v}</div>
      <div style={{ fontSize: 10, color: "#5b6470" }}>{sub || " "}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "8px 8px" },
  btn: { background: "#22d3ee", color: "#04141a", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  btnEdit: { background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b55", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "#ef444422", color: "#ef4444", border: "1px solid #ef444455", borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" },
  lab: { display: "grid", gap: 4, fontSize: 11, color: "#9ca3af", fontWeight: 600 },
};
