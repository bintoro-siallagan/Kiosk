// src/Admin/AdminGeneralLedger.jsx
// General Ledger — chart of accounts + Memorial Journal.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0369a1";
const TYPE_C = { Aset: "#10b981", Kewajiban: "#f59e0b", Ekuitas: "#a855f7", Pendapatan: "#3b82f6", HPP: "#ec4899", Beban: "#ef4444" };

export default function AdminGeneralLedger({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ debit: "", credit: "", amount: "", description: "" });
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/general-ledger`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/general-ledger/memorial/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: editing.description || "" }),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (m) => {
    const ok = await confirm({
      title: `Hapus jurnal "${m.ref}"?`,
      message: "⚠️ Audit-sensitive: hanya jurnal <24 hr (anggap draft) yang bisa dihapus. Jika sudah ter-posting, buat jurnal koreksi/balik.",
      danger: true, okLabel: "Delete",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/general-ledger/memorial/${m.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  const post = () => {
    if (!form.debit || !form.credit || !(Number(form.amount) > 0)) { setMsg("⚠ Account debit, kredit & jumlah wajib"); return; }
    fetch(`${apiBase}/api/general-ledger/memorial`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: Number(form.amount), posted_by: "Finance" }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Jurnal memorial diposting — saldo akun ter-update"); setForm({ debit: "", credit: "", amount: "", description: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat General Ledger…</div>;
  const s = d.summary;
  const allAccounts = d.groups.flatMap(g => g.accounts);

  return (
    <div>
      <div style={S.intro}>
        📒 <b style={{ color: "#38bdf8" }}>GENERAL LEDGER</b> — chart of accounts &amp; saldo per akun +
        Memorial Journal (jurnal manual / penyesuaian). Posting memorial langsung update saldo GL.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Account" v={String(s.accounts)} c={AC} />
        <Kpi label="Total Aset" v={fmtRp(s.total_aset)} c="#10b981" />
        <Kpi label="Total Beban" v={fmtRp(s.total_beban)} c="#ef4444" />
        <Kpi label="Jurnal Memorial" v={String(s.memorial_count)} c="#a855f7" />
      </div>

      {/* Chart of accounts */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📑 CHART OF ACCOUNTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12, marginTop: 10 }}>
          {d.groups.map(g => (
            <div key={g.type} style={{ background: "#0a0e16", border: "1px solid #161b22", borderTop: `2px solid ${TYPE_C[g.type]}`, borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: TYPE_C[g.type] }}>{g.type}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#e6edf3", fontFamily: "'Geist Mono',monospace" }}>{fmtRp(g.total)}</span>
              </div>
              {g.accounts.map(a => (
                <div key={a.code} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: "#9da7b3" }}>
                  <span><span style={{ color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{a.code}</span> {a.name}</span>
                  <span style={{ fontFamily: "'Geist Mono',monospace" }}>{fmtRp(a.balance)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Memorial journal post */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>✍️ POSTING JURNAL MEMORIAL</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr 1.6fr auto", gap: 8, marginTop: 10 }}>
          <select value={form.debit} onChange={e => setForm({ ...form, debit: e.target.value })} style={S.input}>
            <option value="">— Account Debit —</option>
            {allAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <select value={form.credit} onChange={e => setForm({ ...form, credit: e.target.value })} style={S.input}>
            <option value="">— Account Credit —</option>
            {allAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Quantity" type="number" style={S.input} />
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" style={S.input} />
          <button onClick={post} style={S.btn}>Posting</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {/* Memorial list */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 JURNAL MEMORIAL — {d.memorial.length}</div>
        {d.memorial.map(m => (
          <div key={m.id} style={{ padding: "10px 0", borderTop: "1px solid #161b22" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 8 }}>
              <span style={{ color: "#e6edf3", fontWeight: 700, flex: 1 }}>{m.ref} <span style={{ color: "#9da7b3", fontWeight: 400 }}>· {m.description}</span></span>
              <button onClick={() => setEditing({ ...m })} title="Edit deskripsi" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
              <button onClick={() => remove(m)} title="Hapus (audit-guarded)" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              <span style={{ fontFamily: "'Geist Mono',monospace", color: "#38bdf8", fontWeight: 700 }}>{fmtRp(m.total)}</span>
            </div>
            {m.lines.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "1px 0 1px 16px", color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>
                <span>{l.account_code} {l.name}</span>
                <span>{l.debit > 0 ? "D " + fmtRp(l.debit) : "K " + fmtRp(l.credit)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 12, padding: 22, width: 480, maxWidth: "92vw", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#e6edf3", marginBottom: 6 }}>Edit Jurnal Memorial — {editing.ref}</div>
            <div style={{ fontSize: 11, color: "#f59e0b", marginBottom: 12, padding: "6px 9px", background: "#f59e0b14", borderRadius: 6, border: "1px solid #f59e0b33" }}>
              ⚠️ Audit-sensitive: hanya deskripsi yang bisa diedit. Untuk koreksi nominal/akun, posting jurnal koreksi/balik baru.
            </div>
            <div style={{ display: "grid", gap: 9 }}>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>REF
                <input value={editing.ref || ""} disabled style={{ ...modalInp, opacity: 0.5 }} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>TOTAL (read-only)
                <input value={fmtRp(editing.total)} disabled style={{ ...modalInp, opacity: 0.5 }} />
              </label>
              <label style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>DESKRIPSI
                <input value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} style={modalInp} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(null)} style={{ background: "transparent", border: "1px solid #21262d", color: "#9da7b3", padding: "8px 14px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={saveEdit} style={{ background: AC, border: "none", color: "#fff", padding: "8px 16px", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>💾 Simpan</button>
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
      <div style={{ fontSize: 17, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0369a1", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
