// src/Admin/AdminGeneralLedger.jsx
// General Ledger — chart of accounts + Memorial Journal.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#0369a1";
const TYPE_C = { Aset: "#10b981", Kewajiban: "#f59e0b", Ekuitas: "#a855f7", Pendapatan: "#3b82f6", Beban: "#ef4444" };

export default function AdminGeneralLedger({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState({ debit: "", credit: "", amount: "", description: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`${apiBase}/api/general-ledger`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = () => {
    if (!form.debit || !form.credit || !(Number(form.amount) > 0)) { setMsg("⚠ Akun debit, kredit & jumlah wajib"); return; }
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
        <Kpi label="Total Akun" v={String(s.accounts)} c={AC} />
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
                <span style={{ fontSize: 12, fontWeight: 800, color: "#e6edf3", fontFamily: "'Space Mono',monospace" }}>{fmtRp(g.total)}</span>
              </div>
              {g.accounts.map(a => (
                <div key={a.code} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0", color: "#9da7b3" }}>
                  <span><span style={{ color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{a.code}</span> {a.name}</span>
                  <span style={{ fontFamily: "'Space Mono',monospace" }}>{fmtRp(a.balance)}</span>
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
            <option value="">— Akun Debit —</option>
            {allAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <select value={form.credit} onChange={e => setForm({ ...form, credit: e.target.value })} style={S.input}>
            <option value="">— Akun Kredit —</option>
            {allAccounts.map(a => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
          </select>
          <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Jumlah" type="number" style={S.input} />
          <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Keterangan" style={S.input} />
          <button onClick={post} style={S.btn}>Posting</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {/* Memorial list */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📜 JURNAL MEMORIAL — {d.memorial.length}</div>
        {d.memorial.map(m => (
          <div key={m.id} style={{ padding: "10px 0", borderTop: "1px solid #161b22" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#e6edf3", fontWeight: 700 }}>{m.ref} <span style={{ color: "#9da7b3", fontWeight: 400 }}>· {m.description}</span></span>
              <span style={{ fontFamily: "'Space Mono',monospace", color: "#38bdf8", fontWeight: 700 }}>{fmtRp(m.total)}</span>
            </div>
            {m.lines.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "1px 0 1px 16px", color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>
                <span>{l.account_code} {l.name}</span>
                <span>{l.debit > 0 ? "D " + fmtRp(l.debit) : "K " + fmtRp(l.credit)}</span>
              </div>
            ))}
          </div>
        ))}
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0369a1", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
