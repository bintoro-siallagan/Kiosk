// src/Admin/AdminRisk.jsx
// Risk Management — risk register enterprise (likelihood × impact).

import { useState, useEffect, useCallback } from "react";
import { useUiKit , LoadingState} from "../components/uiKit.jsx";

const AC = "#dc2626";
const LVL = { Critical: "#ef4444", High: "#f97316", Medium: "#f59e0b", Low: "#10b981" };
const STT = { open: "#ef4444", mitigating: "#f59e0b", closed: "#10b981" };
const CATS = ['Operations', 'Finance', 'Compliance', 'Strategic', 'Reputation', 'Technology'];

export default function AdminRisk({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", category: "Operations", likelihood: "3", impact: "3", mitigation: "", owner: "" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/risk`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.title.trim()) { setMsg("⚠ Judul risiko wajib"); return; }
    fetch(`${apiBase}/api/risk`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Risiko ditambah"); setForm({ ...form, title: "", mitigation: "", owner: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const setStatus = (rk, status) => {
    fetch(`${apiBase}/api/risk/${rk.id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/risk/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.title || item.code || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/risk/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <LoadingState label="Memuat Risk Management…" />;
  const s = d.summary;
  const maxL = Math.max(1, ...s.by_level.map(x => x.count));

  return (
    <div>
      <div style={S.intro}>
        ⚠️ <b style={{ color: "#f87171" }}>RISK MANAGEMENT</b> — risk register enterprise.
        Likelihood × Impact → skor &amp; level risiko, mitigasi, owner &amp; status.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Risiko" v={String(s.total)} c={AC} />
        <Kpi label="Terbuka" v={String(s.open)} c="#f59e0b" />
        <Kpi label="Critical" v={String(s.critical)} c={s.critical > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Avg Skor" v={String(s.avg_score)} c={s.avg_score >= 12 ? "#ef4444" : s.avg_score >= 8 ? "#f59e0b" : "#10b981"} />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📊 SEBARAN LEVEL RISIKO (terbuka)</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {s.by_level.map(x => (
            <div key={x.level} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 80, fontSize: 12, color: LVL[x.level], fontWeight: 700 }}>{x.level}</span>
              <div style={{ flex: 1, height: 16, background: "#0a0e16", borderRadius: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: Math.max(x.count / maxL * 100, x.count > 0 ? 4 : 0) + "%", background: LVL[x.level] }} />
              </div>
              <span style={{ width: 28, textAlign: "right", fontSize: 12, fontFamily: "'Geist Mono',monospace", color: "#cdd5df" }}>{x.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH RISIKO</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.1fr 0.7fr 0.7fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul risiko" style={S.input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={form.likelihood} onChange={e => setForm({ ...form, likelihood: e.target.value })} style={S.input} title="Likelihood 1-5">
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>L{n}</option>)}
          </select>
          <select value={form.impact} onChange={e => setForm({ ...form, impact: e.target.value })} style={S.input} title="Impact 1-5">
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>I{n}</option>)}
          </select>
          <input value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="Owner" style={S.input} />
          <button onClick={add} style={S.btn}>+ Risiko</button>
        </div>
        <input value={form.mitigation} onChange={e => setForm({ ...form, mitigation: e.target.value })} placeholder="Rencana mitigasi (opsional)" style={{ ...S.input, width: "100%", marginTop: 8 }} />
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>⚠️ RISK REGISTER — {d.risks.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["RISIKO", "KATEGORI", "L×I", "SKOR", "LEVEL", "OWNER", "STATUS", ""].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.risks.map(rk => (
              <tr key={rk.id} style={{ borderTop: "1px solid #161b22", fontSize: 12, opacity: rk.status === "closed" ? 0.5 : 1 }}>
                <td style={{ ...S.td }}>
                  <div style={{ color: "#e6edf3", fontWeight: 600 }}>{rk.title}</div>
                  {rk.mitigation ? <div style={{ fontSize: 10, color: "#5b6470" }}>↳ {rk.mitigation}</div> : null}
                </td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{rk.category}</td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{rk.likelihood}×{rk.impact}</td>
                <td style={{ ...S.td, ...S.mono, fontWeight: 800, color: LVL[rk.level] }}>{rk.score}</td>
                <td style={S.td}><span style={{ fontSize: 9, fontWeight: 700, color: "#fff", background: LVL[rk.level], borderRadius: 4, padding: "2px 7px" }}>{rk.level.toUpperCase()}</span></td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{rk.owner}</td>
                <td style={S.td}>
                  <select value={rk.status} onChange={e => setStatus(rk, e.target.value)}
                    style={{ ...S.input, padding: "4px 6px", fontSize: 11, color: STT[rk.status], fontWeight: 700 }}>
                    {["open", "mitigating", "closed"].map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => setEditing({ ...rk })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                    <button onClick={() => remove(rk)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
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
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || editing.code || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Judul Risiko
                <input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Kategori
                <select value={editing.category || "Operations"} onChange={e => setEditing({ ...editing, category: e.target.value })} style={modalInp}>
                  {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Likelihood (1-5)
                  <select value={editing.likelihood || 3} onChange={e => setEditing({ ...editing, likelihood: Number(e.target.value) })} style={modalInp}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: "#9ca3af" }}>Impact (1-5)
                  <select value={editing.impact || 3} onChange={e => setEditing({ ...editing, impact: Number(e.target.value) })} style={modalInp}>
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Mitigasi
                <input value={editing.mitigation || ""} onChange={e => setEditing({ ...editing, mitigation: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Owner
                <input value={editing.owner || ""} onChange={e => setEditing({ ...editing, owner: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status
                <select value={editing.status || "open"} onChange={e => setEditing({ ...editing, status: e.target.value })} style={modalInp}>
                  <option value="open">open</option>
                  <option value="mitigating">mitigating</option>
                  <option value="closed">closed</option>
                </select>
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
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
