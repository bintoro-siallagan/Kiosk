// src/Admin/AdminConvenienceFee.jsx
// Config Convenience Fee — biaya layanan transaksi digital (QRIS dll)
// buat nutup biaya MDR. Tunai bebas fee.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminConvenienceFee({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/convenience-fee`).then(r => r.json()).then(setCfg).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const save = () => {
    fetch(`${apiBase}/api/convenience-fee`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Tersimpan — langsung berlaku di kiosk/QR"); setCfg({ enabled: j.enabled, amount: j.amount, label: j.label }); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  const saveEdit = async () => {
    const r = await fetch(`${apiBase}/api/convenience-fee/1`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };

  const remove = async () => {
    const ok = await confirm({ title: `Reset konfigurasi Convenience Fee?`, message: "Fee akan dimatikan & nilai direset to 0. Bisa diaktifkan kembali nanti.", danger: true, okLabel: "Reset" });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/convenience-fee/1`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Direset"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!cfg) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat config…</div>;

  return (
    <div>
      <div style={S.intro}>
        🧾 <b style={{ color: "#fb923c" }}>CONVENIENCE FEE</b> — biaya layanan buat transaksi <b>digital
        (QRIS / e-wallet / gateway)</b> for nutup biaya MDR. <b>Tunai bebas fee.</b> Fee otomatis
        nempel di checkout kiosk/QR &amp; tampil jelas di struk customer.
      </div>

      <div style={{ ...S.card, maxWidth: 480 }}>
        <div style={S.kicker}>⚙️ PENGATURAN</div>

        <label style={S.row}>
          <span style={S.lbl}>Status</span>
          <button onClick={() => setCfg({ ...cfg, enabled: cfg.enabled ? 0 : 1 })}
            style={{ ...S.toggle, background: cfg.enabled ? "#10b981" : "#21262d", color: cfg.enabled ? "#04140c" : "#9da7b3" }}>
            {cfg.enabled ? "● AKTIF" : "○ NONAKTIF"}
          </button>
        </label>

        <label style={S.row}>
          <span style={S.lbl}>Quantity fee (Rp)</span>
          <input type="number" value={cfg.amount} onChange={e => setCfg({ ...cfg, amount: Number(e.target.value) })} style={S.input} />
        </label>

        <label style={S.row}>
          <span style={S.lbl}>Label di struk</span>
          <input value={cfg.label} onChange={e => setCfg({ ...cfg, label: e.target.value })} style={S.input} />
        </label>

        <div style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#9da7b3", margin: "6px 0 12px" }}>
          Preview di struk QRIS:<br />
          <span style={{ color: "#fb923c", fontFamily: "'Geist Mono',monospace" }}>
            🧾 {cfg.label || "Biaya Layanan"} &nbsp; +{fmtRp(cfg.amount)}
          </span>
          <div style={{ marginTop: 4, color: "#5b6470" }}>💵 Transaction tunai → tanpa fee</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={save} style={S.btn}>Save</button>
          <button onClick={() => setEditing({ ...cfg })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "7px 11px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️ Edit</button>
          <button onClick={remove} title="Reset" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "7px 11px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️ Reset</button>
        </div>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 540, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Edit — Convenience Fee</div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Status
                <select value={editing.enabled ? 1 : 0} onChange={e => setEditing({ ...editing, enabled: Number(e.target.value) })} style={modalInp}>
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Jumlah Fee (Rp)
                <input type="number" value={editing.amount || 0} onChange={e => setEditing({ ...editing, amount: Number(e.target.value) })} style={modalInp} />
              </label>
              <label style={{ fontSize: 11, color: "#9ca3af" }}>Label di Struk
                <input value={editing.label || ""} onChange={e => setEditing({ ...editing, label: e.target.value })} style={modalInp} />
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

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace", marginBottom: 12 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 },
  lbl: { fontSize: 13, color: "#cdd5df" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", width: 200, textAlign: "right" },
  toggle: { border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Geist Mono',monospace" },
  btn: { background: "#fb923c", color: "#1a0f02", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
