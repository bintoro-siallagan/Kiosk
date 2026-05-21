// src/Admin/AdminMasterCategory.jsx
// Master Category — kategori & sub-kategori produk + mapping COA.

import { useState, useEffect, useCallback } from "react";

const AC = "#0891b2";

export default function AdminMasterCategory({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [cat, setCat] = useState({ name: "", sales_account: "4-1100", cogs_account: "5-1100" });
  const [sub, setSub] = useState({ name: "", parent_code: "" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/master-category`).then(r => r.json()).then(j => {
      setD(j); setSub(s => s.parent_code ? s : { ...s, parent_code: (j.categories[0] && j.categories[0].code) || "" });
    }).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const post = (body, okMsg) => {
    fetch(`${apiBase}/api/master-category`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(okMsg); load(); } else setMsg(j.error || "gagal"); }).catch(e => setMsg(String(e)));
  };
  const toggle = (c) => {
    fetch(`${apiBase}/api/master-category/${c.id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Master Category…</div>;
  const s = d.summary;
  const coaOpt = (a) => `${a.code} · ${a.name}`;

  return (
    <div>
      <div style={S.intro}>
        🗂️ <b style={{ color: "#22d3ee" }}>MASTER CATEGORY</b> — kategori &amp; sub-kategori produk (2 level).
        Tiap kategori dipetakan ke <b>akun COA</b> (Pendapatan &amp; HPP) — penjualan posting ke akun yang benar.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Kategori" v={String(s.total_categories)} c={AC} />
        <Kpi label="Sub-Kategori" v={String(s.total_subcategories)} c="#3b82f6" />
        <Kpi label="Ter-mapping COA" v={`${s.coa_mapped}/${s.total_categories}`} c="#10b981" />
        <Kpi label="Aktif" v={String(s.active)} c="#a855f7" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH KATEGORI / SUB-KATEGORI</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.6fr 1.6fr auto", gap: 8, marginTop: 10, alignItems: "center" }}>
          <input value={cat.name} onChange={e => setCat({ ...cat, name: e.target.value })} placeholder="Nama kategori baru" style={S.input} />
          <select value={cat.sales_account} onChange={e => setCat({ ...cat, sales_account: e.target.value })} style={S.input}>
            {d.coa_accounts.revenue.map(a => <option key={a.code} value={a.code}>📈 {coaOpt(a)}</option>)}
          </select>
          <select value={cat.cogs_account} onChange={e => setCat({ ...cat, cogs_account: e.target.value })} style={S.input}>
            {d.coa_accounts.cogs.map(a => <option key={a.code} value={a.code}>📉 {coaOpt(a)}</option>)}
          </select>
          <button onClick={() => { if (cat.name.trim()) { post({ ...cat }, "✓ Kategori ditambah"); setCat({ ...cat, name: "" }); } }} style={S.btn}>+ Kategori</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.6fr auto", gap: 8, marginTop: 8, alignItems: "center" }}>
          <input value={sub.name} onChange={e => setSub({ ...sub, name: e.target.value })} placeholder="Nama sub-kategori" style={S.input} />
          <select value={sub.parent_code} onChange={e => setSub({ ...sub, parent_code: e.target.value })} style={S.input}>
            {d.categories.map(c => <option key={c.code} value={c.code}>↳ {c.name}</option>)}
          </select>
          <button onClick={() => { if (sub.name.trim()) { post({ name: sub.name, parent_code: sub.parent_code }, "✓ Sub-kategori ditambah"); setSub({ ...sub, name: "" }); } }} style={S.btnGhost}>+ Sub-Kategori</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🗂️ DAFTAR KATEGORI — {d.categories.length}</div>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {d.categories.map(c => (
            <div key={c.code} style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 9, padding: "11px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{c.name}</span>
                <span style={{ fontSize: 10, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{c.code}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: "#10b981", fontFamily: "'Space Mono',monospace" }}>📈 {c.sales_account}</span>
                <span style={{ fontSize: 10, color: "#f59e0b", fontFamily: "'Space Mono',monospace" }}>📉 {c.cogs_account}</span>
                <button onClick={() => toggle(c)} style={S.tog(c.is_active)}>{c.is_active ? "● AKTIF" : "○ OFF"}</button>
              </div>
              <div style={{ fontSize: 10, color: "#5b6470", marginTop: 2 }}>{c.sales_account_name} · {c.cogs_account_name}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {c.subs.map(sb => (
                  <button key={sb.code} onClick={() => toggle(sb)} style={{ fontSize: 11, color: sb.is_active ? "#9da7b3" : "#5b6470", background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontFamily: "inherit", textDecoration: sb.is_active ? "none" : "line-through" }}>
                    ↳ {sb.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Space Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Space Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#0891b2", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnGhost: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  tog: (on) => ({ fontSize: 9, fontWeight: 700, color: on ? "#10b981" : "#5b6470", background: (on ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(on ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Space Mono',monospace", cursor: "pointer" }),
};
