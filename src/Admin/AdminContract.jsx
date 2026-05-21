// src/Admin/AdminContract.jsx
// Contract Management — kontrak vendor / sewa / franchise + alert.

import { useState, useEffect, useCallback } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const AC = "#ca8a04";
const ST = { active: { c: "#10b981", l: "AKTIF" }, expiring: { c: "#f59e0b", l: "SEGERA HABIS" }, expired: { c: "#ef4444", l: "KEDALUWARSA" } };

export default function AdminContract({ apiBase = "" }) {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ title: "", type: "Sewa Tempat", counterparty: "", value: "", outlet: "", duration_months: "12" });

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
  const renew = (c) => {
    fetch(`${apiBase}/api/contract/${c.id}/renew`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ extend_months: 12 }),
    }).then(r => r.json()).then(j => { if (j.ok) { setMsg(`✓ ${c.title} diperpanjang +12 bulan`); load(); } }).catch(() => {});
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
        <Kpi label="Aktif" v={String(s.active)} c="#10b981" />
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
                    {c.title} <span style={{ fontSize: 10, color: "#ca8a04", fontFamily: "'Space Mono',monospace" }}>· {c.type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Space Mono',monospace" }}>{c.code} · {c.counterparty} · {c.outlet}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, color: "#cdd5df", fontFamily: "'Space Mono',monospace" }}>{c.value > 0 ? fmtRp(c.value) : "—"}</div>
                  <div style={{ fontSize: 10, color: st.c }}>{c.status === "expired" ? `lewat ${-c.days_left} hari` : `s/d ${fmtDate(c.end_date)}`}</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 8px", width: 96, textAlign: "center", fontFamily: "'Space Mono',monospace" }}>{st.l}</span>
                <button onClick={() => renew(c)} style={S.btnRenew}>↻ Perpanjang</button>
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
  btn: { background: "#ca8a04", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnRenew: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
