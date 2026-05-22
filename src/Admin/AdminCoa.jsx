// src/Admin/AdminCoa.jsx
// Chart of Accounts — master daftar akun akuntansi.

import { useState, useEffect, useCallback } from "react";

const AC = "#1d4ed8";
const TYPE_C = {
  Aset: "#10b981", Kewajiban: "#f59e0b", Ekuitas: "#a855f7",
  Pendapatan: "#3b82f6", HPP: "#ec4899", Beban: "#ef4444",
};

export default function AdminCoa({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ code: "", name: "", account_type: "Beban", account_group: "" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/coa`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (path, body, okMsg) => {
    fetch(`${apiBase}/api/coa/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : "{}",
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const add = () => {
    if (!form.code.trim() || !form.name.trim()) { setMsg("⚠ Kode & nama akun wajib"); return; }
    post("", form, `✓ Akun ${form.code} ditambah`);
    setForm({ code: "", name: "", account_type: "Beban", account_group: "" });
  };
  const edit = (a) => {
    const name = window.prompt(`Edit nama akun — ${a.code}`, a.name);
    if (name == null || !name.trim()) return;
    const type = window.prompt(`Tipe akun (${d.types.join(" / ")})`, a.account_type);
    if (type == null || !d.types.includes(type.trim())) { setMsg("⚠ Tipe akun tidak valid"); return; }
    const group = window.prompt("Grup akun", a.account_group);
    if (group == null) return;
    post(a.code, { name: name.trim(), account_type: type.trim(), account_group: group.trim() }, `✓ Akun ${a.code} diperbarui`);
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Chart of Accounts…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📚 <b style={{ color: "#60a5fa" }}>CHART OF ACCOUNTS</b> — master daftar akun akuntansi, terstruktur
        per tipe &amp; grup. Fondasi semua modul akuntansi: GL, jurnal, settlement &amp; laporan keuangan.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Akun" v={String(s.total)} c={AC} />
        <Kpi label="Akun Aktif" v={String(s.active)} c="#10b981" />
        <Kpi label="Nonaktif" v={String(s.inactive)} c={s.inactive > 0 ? "#f59e0b" : "#5b6470"} />
        <Kpi label="Tipe Akun" v={String(s.by_type.length)} c="#a855f7" />
      </div>

      <div style={{ display: "flex", gap: 6, margin: "12px 0 0", flexWrap: "wrap" }}>
        {s.by_type.map(t => (
          <span key={t.type} style={{ fontSize: 11, fontWeight: 700, color: TYPE_C[t.type], background: TYPE_C[t.type] + "1a", border: `1px solid ${TYPE_C[t.type]}44`, borderRadius: 6, padding: "4px 10px" }}>
            {t.type} · {t.count}
          </span>
        ))}
      </div>

      {/* Add account */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH AKUN</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1.2fr 1.6fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Kode (mis. 6-2000)" style={S.input} />
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama akun" style={S.input} />
          <select value={form.account_type} onChange={e => setForm({ ...form, account_type: e.target.value })} style={S.input}>
            {d.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.account_group} onChange={e => setForm({ ...form, account_group: e.target.value })} placeholder="Grup (opsional)" style={S.input} />
          <button onClick={add} style={S.btn}>+ Akun</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {/* COA tree */}
      {d.groups.map(g => (
        <div key={g.type} style={{ ...S.card, marginTop: 14, borderTop: `2px solid ${TYPE_C[g.type]}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: TYPE_C[g.type] }}>{g.type.toUpperCase()}</span>
            <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{g.count} akun · saldo normal {g.normal}</span>
          </div>
          {g.sub.map(sub => (
            <div key={sub.group} style={{ marginTop: 9 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9da7b3", fontFamily: "'Geist Mono',monospace", marginBottom: 3 }}>{sub.group}</div>
              {sub.accounts.map(a => (
                <div key={a.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0 5px 14px", fontSize: 12, borderTop: "1px solid #161b22" }}>
                  <span style={{ width: 64, fontFamily: "'Geist Mono',monospace", color: TYPE_C[g.type] }}>{a.code}</span>
                  <span style={{ flex: 1, color: a.is_active ? "#e6edf3" : "#5b6470", textDecoration: a.is_active ? "none" : "line-through" }}>{a.name}</span>
                  <span style={{ fontSize: 9, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{a.normal_balance.toUpperCase()}</span>
                  <button onClick={() => edit(a)} style={{ fontSize: 10, color: "#60a5fa", background: "#1d4ed81f", border: "1px solid #1d4ed855", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit" }}>✎ Edit</button>
                  <button onClick={() => post(`${a.code}/toggle`, null, `✓ ${a.code} ${a.is_active ? "dinonaktifkan" : "diaktifkan"}`)}
                    style={{ width: 78, fontSize: 9, fontWeight: 700, color: a.is_active ? "#10b981" : "#5b6470", background: (a.is_active ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(a.is_active ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 6px", fontFamily: "'Geist Mono',monospace", cursor: "pointer" }}>
                    {a.is_active ? "● AKTIF" : "○ OFF"}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
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

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
