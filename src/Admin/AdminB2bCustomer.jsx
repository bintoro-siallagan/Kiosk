// src/Admin/AdminB2bCustomer.jsx
// B2B Customer — master pelanggan korporat untuk Sales Order.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const AC = "#5b21b6";
const TYPE_C = { "Antar PT": "#3b82f6", "Lintas Brand": "#a855f7", Korporat: "#0d9488", Franchise: "#fbbf24" };

export default function AdminB2bCustomer({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ name: "", customer_type: "Korporat", contact_person: "", phone: "", credit_limit: "", payment_terms: "NET 14" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/b2b-customer`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.name.trim()) { setMsg("⚠ Nama customer wajib"); return; }
    fetch(`${apiBase}/api/b2b-customer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, credit_limit: Number(form.credit_limit) || 0 }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Customer ditambah"); setForm({ ...form, name: "", contact_person: "", phone: "", credit_limit: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const toggle = (c) => {
    fetch(`${apiBase}/api/b2b-customer/${c.id}/toggle`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      .then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat B2B Customer…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        🏢 <b style={{ color: "#a78bfa" }}>B2B CUSTOMER</b> — master pelanggan korporat untuk Sales Order:
        PT, lintas brand &amp; klien korporat. Profil, NPWP, credit limit &amp; termin pembayaran.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Customer" v={String(s.total)} c={AC} />
        <Kpi label="Aktif" v={String(s.active)} c="#10b981" />
        <Kpi label="Total Credit Limit" v={fmtRp(s.total_credit_limit)} c="#f59e0b" />
        <Kpi label="Tipe" v={String(s.by_type.length)} c="#a855f7" />
      </div>
      <div style={{ display: "flex", gap: 7, margin: "10px 2px 0", flexWrap: "wrap" }}>
        {s.by_type.map(t => (
          <span key={t.type} style={{ fontSize: 11, fontWeight: 700, color: TYPE_C[t.type], background: TYPE_C[t.type] + "1a", border: `1px solid ${TYPE_C[t.type]}44`, borderRadius: 6, padding: "3px 9px" }}>{t.type} · {t.count}</span>
        ))}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH CUSTOMER</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.2fr 1fr 1fr 1fr auto", gap: 8, marginTop: 10 }}>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama PT / Brand" style={S.input} />
          <select value={form.customer_type} onChange={e => setForm({ ...form, customer_type: e.target.value })} style={S.input}>
            {d.customer_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} placeholder="Kontak" style={S.input} />
          <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Telepon" style={S.input} />
          <input value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} placeholder="Credit limit" type="number" style={S.input} />
          <select value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} style={S.input}>
            {d.terms.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={add} style={S.btn}>+ Add</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🏢 DAFTAR CUSTOMER — {d.customers.length}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
          <thead>
            <tr style={{ color: "#5b6470", fontSize: 10, textAlign: "left" }}>
              {["KODE", "CUSTOMER", "TIPE", "KONTAK", "NPWP", "CREDIT LIMIT", "TERMIN", "STATUS"].map(h => <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.customers.map(c => (
              <tr key={c.id} style={{ borderTop: "1px solid #161b22", fontSize: 12 }}>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470" }}>{c.code}</td>
                <td style={{ ...S.td, color: "#e6edf3", fontWeight: 600 }}>{c.name}</td>
                <td style={S.td}><span style={{ fontSize: 10, fontWeight: 700, color: TYPE_C[c.customer_type] || "#9ca3af" }}>{c.customer_type}</span></td>
                <td style={{ ...S.td, color: "#9da7b3" }}>{c.contact_person}<div style={{ fontSize: 10, color: "#5b6470" }}>{c.phone}</div></td>
                <td style={{ ...S.td, ...S.mono, color: "#5b6470", fontSize: 10 }}>{c.npwp}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{fmtRp(c.credit_limit)}</td>
                <td style={{ ...S.td, ...S.mono, color: "#9da7b3" }}>{c.payment_terms}</td>
                <td style={S.td}>
                  <button onClick={() => toggle(c)} style={{ fontSize: 9, fontWeight: 700, color: c.status === "active" ? "#10b981" : "#5b6470", background: (c.status === "active" ? "#10b981" : "#5b6470") + "1f", border: `1px solid ${(c.status === "active" ? "#10b981" : "#5b6470")}55`, borderRadius: 5, padding: "3px 8px", fontFamily: "'Space Mono',monospace", cursor: "pointer" }}>
                    {c.status === "active" ? "● AKTIF" : "○ OFF"}
                  </button>
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
  btn: { background: "#5b21b6", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
