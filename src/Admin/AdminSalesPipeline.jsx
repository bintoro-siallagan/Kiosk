// src/Admin/AdminSalesPipeline.jsx
// Sales Pipeline / CRM — funnel lead B2B.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtJt = (n) => (n / 1e6).toFixed(0) + " jt";
const AC = "#6366f1";
const STAGE_C = { Prospek: "#7d8590", Qualified: "#3b82f6", Proposal: "#f59e0b", Negosiasi: "#a855f7", Menang: "#10b981", Kalah: "#ef4444" };

export default function AdminSalesPipeline({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ company: "", contact: "", value: "", owner: "", source: "Referral" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/sales-pipeline`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.company.trim()) { setMsg("⚠ Nama perusahaan wajib"); return; }
    fetch(`${apiBase}/api/sales-pipeline`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, value: Number(form.value) || 0 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Lead ditambah"); setForm({ ...form, company: "", contact: "", value: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const move = (lead, stage) => {
    fetch(`${apiBase}/api/sales-pipeline/${lead.id}/stage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Sales Pipeline…</div>;
  const s = d.summary;
  const maxV = Math.max(1, ...d.stages.map(x => x.value));

  return (
    <div>
      <div style={S.intro}>
        🎯 <b style={{ color: "#818cf8" }}>SALES PIPELINE / CRM</b> — funnel lead B2B: prospek → qualified →
        proposal → negosiasi → menang/kalah. Pantau nilai pipeline &amp; konversi.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Lead" v={String(s.total_leads)} c={AC} />
        <Kpi label="Nilai Pipeline" v={fmtRp(s.pipeline_value)} c="#f59e0b" />
        <Kpi label="Win Rate" v={s.win_rate + "%"} c={s.win_rate >= 50 ? "#10b981" : "#f59e0b"} />
        <Kpi label="Lead Open" v={String(s.open)} c="#3b82f6" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH LEAD</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Nama perusahaan" style={S.input} />
          <input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Kontak (PIC)" style={S.input} />
          <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="Nilai deal" type="number" style={S.input} />
          <input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="Sales owner" style={S.input} />
          <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Sumber" style={S.input} />
          <button onClick={add} style={S.btn}>+ Lead</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 FUNNEL — NILAI PER STAGE</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {d.stages.map(st => (
            <div key={st.stage} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 90, fontSize: 12, color: STAGE_C[st.stage], fontWeight: 700 }}>{st.stage}</span>
              <div style={{ flex: 1, height: 16, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.max(st.value / maxV * 100, st.value > 0 ? 4 : 0) + "%", background: STAGE_C[st.stage] }} />
              </div>
              <span style={{ width: 70, textAlign: "right", fontSize: 12, fontFamily: "'Space Mono',monospace", color: "#cdd5df" }}>{fmtJt(st.value)}</span>
              <span style={{ width: 28, textAlign: "right", fontSize: 10, color: "#5b6470" }}>{st.count}×</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 DAFTAR LEAD — {d.summary.total_leads}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["PERUSAHAAN", "KONTAK", "NILAI", "OWNER", "SUMBER", "STAGE"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.stages.flatMap(st => st.items).sort((a, b) => b.value - a.value).map(l => (
              <tr key={l.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{l.company}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{l.contact || "—"}</td>
                <td style={{ ...S.td, ...S.mono, color: "#f59e0b" }}>{fmtRp(l.value)}</td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{l.owner}</td>
                <td style={{ ...S.td, color: "#5b6470" }}>{l.source}</td>
                <td style={S.td}>
                  <select value={l.stage} onChange={e => move(l, e.target.value)}
                    style={{ ...S.input, padding: "4px 6px", fontSize: 11, color: STAGE_C[l.stage], fontWeight: 700 }}>
                    {d.all_stages.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  td: { padding: "7px 8px" },
  mono: { fontFamily: "'Space Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
