// src/Admin/AdminCompliance.jsx
// Compliance & Perizinan — izin & sertifikasi F&B + alert masa berlaku.

import { useState, useEffect, useCallback } from "react";

const AC = "#15803d";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const ST = { valid: { c: "#10b981", l: "BERLAKU" }, expiring: { c: "#f59e0b", l: "SEGERA HABIS" }, expired: { c: "#ef4444", l: "KEDALUWARSA" } };

export default function AdminCompliance({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ type: "Halal MUI", name: "", number: "", issuer: "", outlet: "", expiry_days: "365" });

  const load = useCallback(() => {
    fetch(`${apiBase}/api/compliance`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const add = () => {
    if (!form.name.trim() || !form.number.trim()) { setMsg("⚠ Nama & nomor izin wajib"); return; }
    fetch(`${apiBase}/api/compliance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, expiry_days: Number(form.expiry_days) || 365 }),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Izin ditambah"); setForm({ ...form, name: "", number: "", issuer: "", outlet: "" }); load(); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };
  const renew = (l) => {
    fetch(`${apiBase}/api/compliance/${l.id}/renew`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extend_days: 365 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${l.name} diperpanjang +1 tahun`); load(); } }).catch(() => {});
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Compliance…</div>;
  const s = d.summary;

  return (
    <div>
      <div style={S.intro}>
        📋 <b style={{ color: "#4ade80" }}>COMPLIANCE & PERIZINAN</b> — tracking izin &amp; sertifikasi F&B
        (Halal MUI, BPOM/PIRT, NIB, Izin Laik Sehat) + alert masa berlaku.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Izin" v={String(s.total)} c={AC} />
        <Kpi label="Berlaku" v={String(s.valid)} c="#10b981" />
        <Kpi label="Segera Habis" v={String(s.expiring)} c={s.expiring > 0 ? "#f59e0b" : "#10b981"} />
        <Kpi label="Kedaluwarsa" v={String(s.expired)} c={s.expired > 0 ? "#ef4444" : "#10b981"} />
      </div>

      {(s.expired > 0 || s.expiring > 0) && (
        <div style={{ ...S.card, marginTop: 10, borderColor: s.expired > 0 ? "#ef444455" : "#f59e0b55", background: s.expired > 0 ? "#1a0d0f" : "#1a160d" }}>
          <div style={{ fontSize: 13, color: s.expired > 0 ? "#fca5a5" : "#fcd34d" }}>
            🚨 <b>{s.expired} izin kedaluwarsa</b> &amp; <b>{s.expiring} segera habis</b> — risiko operasional &amp; hukum. Segera perpanjang!
          </div>
        </div>
      )}

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>➕ TAMBAH IZIN / SERTIFIKAT</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 1.2fr 1.2fr 1fr 0.9fr auto", gap: 8, marginTop: 10 }}>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={S.input}>
            {d.types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nama izin" style={S.input} />
          <input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="Nomor" style={S.input} />
          <input value={form.issuer} onChange={e => setForm({ ...form, issuer: e.target.value })} placeholder="Penerbit" style={S.input} />
          <input value={form.outlet} onChange={e => setForm({ ...form, outlet: e.target.value })} placeholder="Outlet" style={S.input} />
          <input value={form.expiry_days} onChange={e => setForm({ ...form, expiry_days: e.target.value })} placeholder="Hari berlaku" type="number" style={S.input} />
          <button onClick={add} style={S.btn}>+ Izin</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>📋 DAFTAR IZIN & SERTIFIKAT — {d.licenses.length}</div>
        <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
          {d.licenses.map(l => {
            const st = ST[l.status];
            return (
              <div key={l.id} style={{ background: "#0a0e16", border: "1px solid #161b22", borderLeft: `3px solid ${st.c}`, borderRadius: 9, padding: "10px 13px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                    {l.name} <span style={{ fontSize: 10, color: "#a78bfa", fontFamily: "'Space Mono',monospace" }}>· {l.type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{l.number} · {l.issuer} · {l.outlet}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#9da7b3" }}>berlaku s/d {fmtDate(l.expiry_date)}</div>
                  <div style={{ fontSize: 10, color: st.c, fontFamily: "'Space Mono',monospace" }}>
                    {l.status === "expired" ? `lewat ${-l.days_left} hari` : `${l.days_left} hari lagi`}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 8px", width: 96, textAlign: "center", fontFamily: "'Space Mono',monospace" }}>{st.l}</span>
                <button onClick={() => renew(l)} style={S.btnRenew}>↻ Perpanjang</button>
              </div>
            );
          })}
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
  btn: { background: "#15803d", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnRenew: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
