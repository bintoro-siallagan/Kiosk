// src/Admin/AdminPayroll.jsx
// Payroll — gaji dari HRIS (staff + OT attendance), lengkap BPJS +
// PPh21 + lembur. Proses → posting otomatis ke finance.

import { useState, useEffect, useCallback } from "react";
import ReportActions from "./ReportActions.jsx";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminPayroll({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/payroll`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const process = () => {
    if (busy) return;
    setBusy(true); setMsg("");
    fetch(`${apiBase}/api/payroll/process`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Payroll diproses & diposting ke Finance sebagai beban gaji"); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e))).finally(() => setBusy(false));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/payroll/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus payroll periode ${item.period}?`,
      message: "Payroll run akan dihapus permanen. Catatan beban gaji di Finance tetap. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Hapus",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/payroll/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Payroll…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        💼 <b style={{ color: "#06B6D4" }}>PAYROLL</b> — gaji otomatis dari HRIS: gaji pokok + lembur
        (dari attendance OT) − BPJS − PPh21. Proses → langsung posting ke Finance. Periode <b>{d.period}</b>.
      </div>

      <ReportActions title={`Payroll ${d.period}`} subtitle="Rincian gaji staff"
        columns={["Staff", "Role", "Gaji Pokok", "Lembur", "Bruto", "BPJS", "PPh21", "THP"]}
        rows={d.lines.map(l => [l.name, l.role, l.gaji_pokok, l.lembur, l.bruto, l.bpjs, l.pph21, l.thp])} />

      <div style={S.kpiRow}>
        <Kpi label="Total THP" v={fmtRp(s.total_thp)} c="#10b981" sub={`${s.staff_count} staff`} />
        <Kpi label="Total Bruto" v={fmtRp(s.total_bruto)} c="#3b82f6" sub="gaji + lembur" />
        <Kpi label="BPJS + PPh21" v={fmtRp(s.total_bpjs + s.total_pph21)} c="#f59e0b" sub="potongan" />
        <Kpi label="Total Cost" v={fmtRp(s.total_cost)} c="#a78bfa" sub="+ BPJS employer" />
      </div>

      {d.processed ? (
        <div style={{ ...S.card, marginTop: 14, borderColor: "#10b98155", color: "#10b981", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span>
            ✓ Payroll <b>{d.period}</b> sudah diproses — Rp {Math.round(d.processed.total_cost).toLocaleString("id-ID")} sudah
            diposting ke Finance sebagai beban gaji. Diproses oleh <b>{d.processed.processed_by}</b>.
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing({ ...d.processed })} title="Edit" style={S.btnEdit}>✏️</button>
            <button onClick={() => remove(d.processed)} title="Hapus" style={S.btnDel}>🗑️</button>
          </div>
        </div>
      ) : (
        <div style={{ ...S.card, marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 13, color: "#9da7b3" }}>Payroller {d.period} belum diproses. Klik untuk hitung final &amp; posting ke Finance.</span>
          <button onClick={process} disabled={busy} style={S.btnPrimary}>{busy ? "Memproses…" : "⚙ Proses Payroll & Posting ke Finance"}</button>
        </div>
      )}
      {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>👥 RINCIAN GAJI — {d.lines.length} STAFF</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["STAFF", "GAJI POKOK", "LEMBUR", "BRUTO", "BPJS", "PPh21", "THP"].map(h => (
                <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} style={{ borderTop: "1px solid #161b22", fontSize: 13 }}>
                <td style={S.td}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{l.name}</div>
                  <div style={{ color: "#5b6470", fontSize: 11 }}>{l.role} · OT {l.ot_hours} jam</div>
                </td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(l.gaji_pokok)}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{l.lembur > 0 ? fmtRp(l.lembur) : "—"}</td>
                <td style={{ ...S.td, ...S.mono, color: "#cdd5df" }}>{fmtRp(l.bruto)}</td>
                <td style={{ ...S.td, ...S.mono, color: "#f87171" }}>−{fmtRp(l.bpjs)}</td>
                <td style={{ ...S.td, ...S.mono, color: "#f87171" }}>{l.pph21 > 0 ? "−" + fmtRp(l.pph21) : "—"}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 700, color: "#10b981" }}>{fmtRp(l.thp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={S.modalBg}>
          <div onClick={e => e.stopPropagation()} style={S.modalBox}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 12 }}>Edit Payroll Run</div>
            <Field label="Periode"><input value={editing.period || ""} disabled style={{ ...modalInp, opacity: 0.6 }} /></Field>
            <Field label="Diproses Oleh"><input value={editing.processed_by || ""} onChange={e => setEditing({ ...editing, processed_by: e.target.value })} style={modalInp} /></Field>
            <Field label="Total Cost"><input value={fmtRp(editing.total_cost)} disabled style={{ ...modalInp, opacity: 0.6 }} /></Field>
            <Field label="Total THP"><input value={fmtRp(editing.total_thp)} disabled style={{ ...modalInp, opacity: 0.6 }} /></Field>
            <div style={{ fontSize: 10, color: "#5b6470", marginTop: 4, marginBottom: 10 }}>Catatan: angka payroll dihitung otomatis dari HRIS — hanya metadata yang bisa diedit.</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditing(null)} style={{ ...S.btnPrimary, background: "#21262d", color: "#e6edf3", flex: 1 }}>Batal</button>
              <button onClick={saveEdit} style={{ ...S.btnPrimary, flex: 1 }}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 10, color: "#5b6470", fontWeight: 700, letterSpacing: 0.5, marginBottom: 4, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      {children}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

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
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "9px 8px" },
  mono: { fontFamily: "'Geist Mono',monospace" },
  btnPrimary: { background: "#06B6D4", color: "#04141a", border: "none", borderRadius: 7, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnEdit: { background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  btnDel: { background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" },
  modalBg: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalBox: { background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 20, maxWidth: 480, width: "100%", boxShadow: "0 0 40px rgba(0,0,0,0.5)" },
};
