// src/Admin/AdminCompliance.jsx
// Compliance & Perizinan — izin & sertifikasi F&B + alert masa berlaku.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#15803d";
const fmtDate = (ts) => ts ? new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";
const ST = { valid: { c: "#10b981", l: "BERLAKU" }, expiring: { c: "#f59e0b", l: "SEGERA HABIS" }, expired: { c: "#ef4444", l: "KEDALUWARSA" } };

export default function AdminCompliance({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ type: "Halal MUI", name: "", number: "", issuer: "", outlet: "", expiry_days: "365" });
  const [editing, setEditing] = useState(null);

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

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/compliance/${editing.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async (item) => {
    const ok = await confirm({ title: `Hapus "${item.name || item.number || '#'+item.id}"?`, message: "Akan dihapus permanen. Tidak bisa dibatalkan.", danger: true, okLabel: "Hapus" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/compliance/${item.id}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
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
                    {l.name} <span style={{ fontSize: 10, color: "#a78bfa", fontFamily: "'Geist Mono',monospace" }}>· {l.type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#5b6470", fontFamily: "'Geist Mono',monospace" }}>{l.number} · {l.issuer} · {l.outlet}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "#9da7b3" }}>berlaku s/d {fmtDate(l.expiry_date)}</div>
                  <div style={{ fontSize: 10, color: st.c, fontFamily: "'Geist Mono',monospace" }}>
                    {l.status === "expired" ? `lewat ${-l.days_left} hari` : `${l.days_left} hari lagi`}
                  </div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: st.c, background: st.c + "1f", border: `1px solid ${st.c}55`, borderRadius: 5, padding: "3px 8px", width: 96, textAlign: "center", fontFamily: "'Geist Mono',monospace" }}>{st.l}</span>
                <button onClick={() => renew(l)} style={S.btnRenew}>↻ Perpanjang</button>
                <button onClick={() => setEditing({ ...l })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
                <button onClick={() => remove(l)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
              </div>
            );
          })}
        </div>
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — {editing.name || editing.number || '#'+editing.id}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Jenis
                <select value={editing.type || "Halal MUI"} onChange={e => setEditing({ ...editing, type: e.target.value })} style={modalInp}>
                  {(d?.types || []).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Nama Izin
                <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Nomor
                <input value={editing.number || ""} onChange={e => setEditing({ ...editing, number: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Penerbit
                <input value={editing.issuer || ""} onChange={e => setEditing({ ...editing, issuer: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Outlet
                <input value={editing.outlet || ""} onChange={e => setEditing({ ...editing, outlet: e.target.value })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Tanggal Berlaku (YYYY-MM-DD)
                <input type="date" value={editing.expiry_date ? new Date(editing.expiry_date * 1000).toISOString().slice(0,10) : ""}
                  onChange={e => setEditing({ ...editing, expiry_date: Math.floor(new Date(e.target.value).getTime() / 1000) })} style={modalInp} />
              </label>
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
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 9px", color: "#e6edf3", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btn: { background: "#15803d", color: "#fff", border: "none", borderRadius: 7, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  btnRenew: { background: "#161b22", color: "#9da7b3", border: "1px solid #21262d", borderRadius: 7, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
