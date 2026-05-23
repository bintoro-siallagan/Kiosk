// src/Admin/AdminSalesPipeline.jsx
// Sales Pipeline / CRM — funnel lead B2B.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtJt = (n) => (n / 1e6).toFixed(0) + " jt";
const AC = "#6366f1";
const STAGE_C = { Prospek: "#7d8590", Qualified: "#3b82f6", Proposal: "#f59e0b", Negosiasi: "#a855f7", Menang: "#10b981", Kalah: "#ef4444" };

export default function AdminSalesPipeline({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ company: "", contact: "", value: "", owner: "", source: "Referral" });
  const [editing, setEditing] = useState(null);

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
  const saveEdit = async () => {
    const payload = { ...editing, value: Number(editing.value) || 0 };
    const r = await fetch(`${apiBase}/api/sales-pipeline/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.company || '#' + item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/sales-pipeline/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
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
              <span style={{ width: 70, textAlign: "right", fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{fmtJt(st.value)}</span>
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
              {["PERUSAHAAN", "KONTAK", "NILAI", "OWNER", "SUMBER", "STAGE", "AKSI"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
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
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setEditing({ ...l })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(l)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.company || '#' + editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Perusahaan</div>
                <input value={editing.company || ""} onChange={e => setEditing({ ...editing, company: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Kontak (PIC)</div>
                <input value={editing.contact || ""} onChange={e => setEditing({ ...editing, contact: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Nilai Deal</div>
                <input type="number" value={editing.value || 0} onChange={e => setEditing({ ...editing, value: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Owner</div>
                <input value={editing.owner || ""} onChange={e => setEditing({ ...editing, owner: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Sumber</div>
                <input value={editing.source || ""} onChange={e => setEditing({ ...editing, source: e.target.value })} style={modalInp} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 4 }}>Stage</div>
                <select value={editing.stage || "Prospek"} onChange={e => setEditing({ ...editing, stage: e.target.value })} style={modalInp}>
                  {(d.all_stages || []).map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
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
  mono: { fontFamily: "'Geist Mono',monospace" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
