// src/Admin/AdminConvenienceFee.jsx
// Config Convenience Fee — biaya layanan transaksi digital (QRIS dll)
// buat nutup biaya MDR. Tunai bebas fee.

import { useState, useEffect } from "react";

const fmtRp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

export default function AdminConvenienceFee({ apiBase = "" }) {
  const [cfg, setCfg] = useState(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${apiBase}/api/convenience-fee`).then(r => r.json()).then(setCfg).catch(() => {});
  }, [apiBase]);

  const save = () => {
    fetch(`${apiBase}/api/convenience-fee`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg),
    }).then(r => r.json()).then(j => {
      if (j.ok) { setMsg("✓ Tersimpan — langsung berlaku di kiosk/QR"); setCfg({ enabled: j.enabled, amount: j.amount, label: j.label }); }
      else setMsg(j.error || "gagal");
    }).catch(e => setMsg(String(e)));
  };

  if (!cfg) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat config…</div>;

  return (
    <div>
      <div style={S.intro}>
        🧾 <b style={{ color: "#fb923c" }}>CONVENIENCE FEE</b> — biaya layanan buat transaksi <b>digital
        (QRIS / e-wallet / gateway)</b> untuk nutup biaya MDR. <b>Tunai bebas fee.</b> Fee otomatis
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
          <span style={S.lbl}>Jumlah fee (Rp)</span>
          <input type="number" value={cfg.amount} onChange={e => setCfg({ ...cfg, amount: Number(e.target.value) })} style={S.input} />
        </label>

        <label style={S.row}>
          <span style={S.lbl}>Label di struk</span>
          <input value={cfg.label} onChange={e => setCfg({ ...cfg, label: e.target.value })} style={S.input} />
        </label>

        <div style={{ background: "#0a0e16", border: "1px solid #161b22", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#9da7b3", margin: "6px 0 12px" }}>
          Preview di struk QRIS:<br />
          <span style={{ color: "#fb923c", fontFamily: "'Space Mono',monospace" }}>
            🧾 {cfg.label || "Biaya Layanan"} &nbsp; +{fmtRp(cfg.amount)}
          </span>
          <div style={{ marginTop: 4, color: "#5b6470" }}>💵 Transaksi tunai → tanpa fee</div>
        </div>

        <button onClick={save} style={S.btn}>Simpan</button>
        {msg ? <div style={{ fontSize: 12, marginTop: 8, color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
      </div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Space Mono',monospace", marginBottom: 12 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12 },
  lbl: { fontSize: 13, color: "#cdd5df" },
  input: { background: "#0a0e16", border: "1px solid #21262d", borderRadius: 7, padding: "8px 10px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", width: 200, textAlign: "right" },
  toggle: { border: "none", borderRadius: 7, padding: "8px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Mono',monospace" },
  btn: { background: "#fb923c", color: "#1a0f02", border: "none", borderRadius: 7, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
};
