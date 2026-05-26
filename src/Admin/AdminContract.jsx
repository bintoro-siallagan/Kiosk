// src/Admin/AdminContract.jsx
// Contract Management — kontrak vendor / sewa / franchise + alert.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const AC = "#ca8a04";
const ST = { active: { c: "#10b981", l: "AKTIF" }, expiring: { c: "#f59e0b", l: "SEGERA HABIS" }, expired: { c: "#ef4444", l: "KEDALUWARSA" } };

export default function AdminContract({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", type: "Sewa Tempat", counterparty: "", value: "", outlet: "", duration_months: "12" });
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/contract`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.title.trim() || !form.counterparty.trim()) { setMsg("⚠ Judul & pihak kontrak wajib"); return; }
    fetch(`${apiBase}/api/contract`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, value: Number(form.value) || 0, duration_months: Number(form.duration_months) || 12 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg("✓ Kontrak ditambah"); setForm({ ...form, title: "", counterparty: "", value: "", outlet: "" }); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/contract/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.title || item.code || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Delete" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/contract/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };
  const renew = (c) => {
    fetch(`${apiBase}/api/contract/${c.id}/renew`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extend_months: 12 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${c.title} diperpanjang +12 month`); load(); } }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Contract Management…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📄 <b style={{ color: "#fcd34d" }}>CONTRACT MANAGEMENT</b> — kontrak vendor, sewa tempat &amp;
        franchise. Tracking masa berlaku + alert perpanjangan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Kontrak" v={String(s.total)} c={AC} />
        <Kpi label="Active" v={String(s.active)} c="#10b981" />
        <Kpi label="Segera Habis" v={String(s.expiring)} c={s.expiring > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Kedaluwarsa" v={String(s.expired)} c={s.expired > 0 ? "#ef4444" : "#10b981"} />
      </div>

      {(s.expired > 0 || s.expiring > 0) && (
        <div style={{ ...S.card, marginTop: 10, borderColor: s.expired > 0 ? "#ef444455" : "#f59e0b55", background: s.expired > 0 ? "#1a0d0f" : "#1a160d" }}>
          <div style={{ fontSize: 13, color: s.expired > 0 ? "#fca5a5" : "#fcd34d" }}>
            🚨 <b>{s.expired} kontrak kedaluwarsa</b> &amp; <b>{s.expiring} segera berakhir</b> — segera review &amp; perpanjang sebelum operasional terganggu.
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH KONTRAK</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.1fr 1.3fr 1fr 1fr 0.9fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Judul kontrak" style={S.input} />
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={S.input}>
            {d.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} placeholder="Pihak kontrak" style={S.input} />
          <input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="Nilai" type="number" style={S.input} />
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <input value={form.duration_months} onChange={e => setForm({ ...form, duration_months: e.target.value })} placeholder="Bulan" type="number" style={S.input} />
          <button onClick={add} style={S.btn}>+ Kontrak</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📄 DAFTAR KONTRAK — {d.contracts.length} · total nilai {fmtRp(s.total_value)}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.contracts.map(c => {
            const st = ST[c.status];
            return (
              <div key={c.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "10px 13px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                    {c.title} <span style={{ fontSize: 10, color: "#ca8a04", fontFamily: "'Geist Mono',monospace" }}>· {c.type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{c.code} · {c.counterparty} · {c.outlet}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#cdd5df", fontFamily: "'Geist Mono',monospace" }}>{c.value > 0 ? fmtRp(c.value) : "—"}</div>
                  <div style={{ fontSize: 10, color: st.c }}>{c.status === "expired" ? `lewat ${-c.days_left} day` : `s/d ${fmtDate(c.end_date)}`}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 8px", width: 96, textAlign: "center", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                <button onClick={() => renew(c)} style={S.btnRenew}>↻ Perpanjang</button>
                <button onClick={() => setEditing({ ...c })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(c)} title="Delete" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.title || editing.code || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>KODE</div><input value={editing.code || ""} onChange={e => setEditing({ ...editing, code: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JUDUL</div><input value={editing.title || ""} onChange={e => setEditing({ ...editing, title: e.target.value })} style={modalInp} /></div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>JENIS</div>
                <select value={editing.type || "Sewa Tempat"} onChange={e => setEditing({ ...editing, type: e.target.value })} style={modalInp}>
                  {d.types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>PIHAK KONTRAK</div><input value={editing.counterparty || ""} onChange={e => setEditing({ ...editing, counterparty: e.target.value })} style={modalInp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>NILAI</div><input type="number" value={editing.value || 0} onChange={e => setEditing({ ...editing, value: Number(e.target.value) })} style={modalInp} /></div>
                <div><div style={{ fontSize: 10, color: "#5b6470", letterSpacing: 1, marginBottom: 4 }}>OUTLET</div><input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} /></div>
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

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#ca8a04", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnRenew: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
