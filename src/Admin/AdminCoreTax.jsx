// src/Admin/AdminCoreTax.jsx
// Core Tax — PPN, PPh, faktur pajak & SPT Masa.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#b91c1c";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—";
const ST = { draft: "#f59e0b", reported: "#3b82f6", paid: "#10b981", siap: "#10b981", pending: "#f59e0b" };

export default function AdminCoreTax({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/core-tax`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const setStatus = (r, status) => {
    fetch(`${apiBase}/api/core-tax/${r.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(x => x.json()).then(j => { if (j.ok) { setMsg(`✓ ${r.label} → ${status}`); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/core-tax/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tax_type: editing.tax_type,
        label: editing.label,
        period: editing.period,
        dpp: Number(editing.dpp) || 0,
        rate: Number(editing.rate) || 0,
        amount: Number(editing.amount) || 0,
        flow: editing.flow,
        status: editing.status,
      }),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.label}"?`,
      message: "Record pajak akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Hapus",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/core-tax/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Core Tax…</div>;
  const s = d.summary, ppn = d.ppn;

  return (
    <div>
      <div style={S.intro}>
        🧾 <b style={{ color: "#f87171" }}>CORE TAX</b> — modul perpajakan: PPN (keluaran/masukan), PPh
        (21 · 23 · 25 · final), faktur pajak &amp; SPT Masa. Kewajiban pajak · {d.period}.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Kewajiban Pajak" v={fmtRp(s.total_liability)} c={AC} />
        <Kpi label="PPN Kurang Bayar" v={fmtRp(s.ppn_payable)} c="#f59e0b" />
        <Kpi label="Total PPh" v={fmtRp(s.pph_total)} c="#3b82f6" />
        <Kpi label="Faktur Pajak Terbit" v={String(s.faktur_issued)} c="#10b981" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* PPN */}
        <div style={S.card}>
          <div style={S.kicker}>💎 PPN — PAJAK PERTAMBAHAN NILAI</div>
          <div style={{ marginTop: 10 }}>
            <Row label={`PPN Keluaran (DPP ${fmtRp(ppn.dpp_penjualan)})`} v={ppn.keluaran} c="#10b981" />
            <Row label="(−) PPN Masukan (kredit pajak)" v={-ppn.masukan} c="#f87171" />
            <Row label="PPN KURANG BAYAR" v={ppn.kurang_bayar} c="#f59e0b" bold />
          </div>
          <div style={{ fontSize: 11, color: "#5b6470", marginTop: 8 }}>
            Disetor ke negara via SPT Masa PPN. Tarif PPN 11%.
          </div>
        </div>
        {/* PPh */}
        <div style={S.card}>
          <div style={S.kicker}>📋 PPh — PAJAK PENGHASILAN</div>
          {d.pph.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #161b22", fontSize: 12 }}>
              <span style={{ flex: 1, color: "#e6edf3" }}>{p.label}</span>
              <span style={{ fontFamily: "'Geist Mono',monospace", fontWeight: 700, color: "#60a5fa" }}>{fmtRp(p.amount)}</span>
              <button onClick={() => setStatus(p, p.status === "paid" ? "draft" : "paid")}
                style={{ width: 76, fontSize: 9, fontWeight: 700, color: ST[p.status], background: ST[p.status] + "1f", border: `1px solid ${ST[p.status]}55`, borderRadius: 5, padding: "3px 6px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
                {p.status.toUpperCase()}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* SPT */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📑 SPT MASA — pelaporan pajak bulanan</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginTop: 10 }}>
          {d.spt.map((x, i) => (
            <div key={i} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${ST[x.status]}`, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e6edf3" }}>{x.name}</div>
              <div style={{ fontSize: 10, color: "#5b6470" }}>{x.period} · jatuh tempo {fmtDate(x.due_date)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: ST[x.status], fontFamily: "'Geist Mono',monospace", marginTop: 5 }}>
                {x.status === "siap" ? "● SIAP LAPOR" : "○ PERLU DILENGKAPI"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🗂️ RECORD PAJAK — {d.records.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["JENIS", "URAIAN", "DPP", "TARIF", "PAJAK", "STATUS", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.records.map(r => (
              <tr key={r.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, fontWeight: 700, color: "#f87171" }}>{r.tax_type}</td>
                <td style={{ ...S.td, color: "#e6edf3" }}>{r.label}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{r.dpp > 0 ? fmtRp(r.dpp) : "—"}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{r.rate > 0 ? r.rate + "%" : "—"}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#cdd5df" }}>{fmtRp(r.amount)}</td>
                <td style={S.td}><span style={{ fontSize: 9, fontWeight: 700, color: ST[r.status], fontFamily: "'Geist Mono',monospace" }}>{r.status.toUpperCase()}</span></td>
                <td style={S.td}>
                  <button onClick={() => setEditing({ ...r })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                  <button onClick={() => remove(r)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, marginLeft: 4 }}>🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 22, width: 500, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>Edit Record Pajak — #{editing.id}</div>
            <div style={{ display: "grid", gap: 9 }}>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>JENIS PAJAK
                <select value={editing.tax_type || ""} onChange={e => setEditing({ ...editing, tax_type: e.target.value })} style={modalInp}>
                  {["PPN", "PPh 21", "PPh 23", "PPh 25", "PPh 4(2)"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>URAIAN
                <input value={editing.label || ""} onChange={e => setEditing({ ...editing, label: e.target.value })} style={modalInp} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>DPP (Rp)
                  <input value={editing.dpp || ""} onChange={e => setEditing({ ...editing, dpp: e.target.value })} type="number" style={modalInp} />
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>TARIF (%)
                  <input value={editing.rate || ""} onChange={e => setEditing({ ...editing, rate: e.target.value })} type="number" style={modalInp} />
                </label>
              </div>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>JUMLAH PAJAK (Rp)
                <input value={editing.amount || ""} onChange={e => setEditing({ ...editing, amount: e.target.value })} type="number" style={modalInp} />
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>FLOW
                  <select value={editing.flow || ""} onChange={e => setEditing({ ...editing, flow: e.target.value })} style={modalInp}>
                    {["output", "input", "pph"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>STATUS
                  <select value={editing.status || ""} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                    {["draft", "reported", "paid"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #21262d", color: "#9da7b3", padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Batal</button>
              <button onClick={saveEdit} style={{ background: AC, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, v, c, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderTop: bold ? "1px solid #21262d" : "none" }}>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 400, color: bold ? "#e6edf3" : "#9da7b3" }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace" }}>{fmtRp(v)}</span>
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
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
};
