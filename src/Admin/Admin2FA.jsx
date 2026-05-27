// src/Admin/Admin2FA.jsx
// White-label P3D — TOTP 2FA self-service enrollment page.
// Workflow:
//   1. Status: shows whether 2FA is enabled or not.
//   2. Enable: POST /setup → render QR + secret → user scans → enters code → POST /enable → display backup codes ONCE.
//   3. Disable: ask for current TOTP/backup code → POST /disable.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../api.js";
import { LoadingState } from "../components/uiKit.jsx";

export default function Admin2FA() {
  const [status, setStatus] = useState({ enabled: false, loading: true });
  const [setup, setSetup] = useState(null);     // { secret, otpauth_uri }
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [enableCode, setEnableCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [backupCodes, setBackupCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", kind: "" });

  async function refresh() {
    setStatus(s => ({ ...s, loading: true }));
    try {
      const s = await api.twoFAStatus();
      setStatus({ enabled: !!s.enabled, enabled_at: s.enabled_at, last_used_at: s.last_used_at, loading: false });
    } catch (e) {
      setStatus({ enabled: false, loading: false });
      setMsg({ text: "Gagal memuat status 2FA: " + (e.message || e), kind: "error" });
    }
  }
  useEffect(() => { refresh(); }, []);

  // Render QR whenever setup arrives
  useEffect(() => {
    if (!setup?.otpauth_uri) { setQrDataUrl(""); return; }
    QRCode.toDataURL(setup.otpauth_uri, { width: 240, margin: 1, errorCorrectionLevel: "M",
      color: { dark: "#0a0c12", light: "#f5f7fb" } })
      .then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [setup]);

  async function beginSetup() {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const s = await api.twoFASetup();
      setSetup({ secret: s.secret, otpauth_uri: s.otpauth_uri });
      setEnableCode("");
      setBackupCodes(null);
    } catch (e) {
      setMsg({ text: "Gagal memulai setup: " + (e.message || e), kind: "error" });
    } finally { setBusy(false); }
  }

  async function confirmEnable() {
    if (enableCode.length < 6) return;
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const res = await api.twoFAEnable(enableCode);
      setBackupCodes(res.backup_codes || []);
      setSetup(null);
      setEnableCode("");
      await refresh();
      setMsg({ text: "✓ 2FA aktif. Simpan backup codes di tempat aman.", kind: "ok" });
    } catch (e) {
      setMsg({ text: e.message || "Kode salah", kind: "error" });
    } finally { setBusy(false); }
  }

  async function confirmDisable() {
    if (!disableCode) return;
    if (!confirm("Yakin matikan 2FA? Akun akan kembali hanya pakai password.")) return;
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      await api.twoFADisable(disableCode);
      setDisableCode("");
      await refresh();
      setMsg({ text: "2FA dimatikan.", kind: "ok" });
    } catch (e) {
      setMsg({ text: e.message || "Kode salah", kind: "error" });
    } finally { setBusy(false); }
  }

  function copyBackupCodes() {
    if (!backupCodes) return;
    const text = backupCodes.join("\n");
    try { navigator.clipboard?.writeText(text); setMsg({ text: "Backup codes disalin ke clipboard.", kind: "ok" }); } catch {}
  }

  if (status.loading) {
    return <div style={S.page}><LoadingState label="Memuat status 2FA…" /></div>;
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.h1}>Two-Factor Authentication</div>
          <div style={S.muted}>Lapisan keamanan kedua untuk akun admin. TOTP standar (Google Authenticator, Authy, 1Password).</div>
        </div>
        <div style={status.enabled ? S.badgeOk : S.badgeOff}>
          {status.enabled ? "● AKTIF" : "○ MATI"}
        </div>
      </div>

      {msg.text && (
        <div style={msg.kind === "error" ? S.alertErr : S.alertOk}>{msg.text}</div>
      )}

      {/* Backup codes — shown ONCE after enable */}
      {backupCodes && (
        <section style={{ ...S.card, borderColor: "rgba(251,191,36,0.4)" }}>
          <div style={S.cardTitle}>⚠ Backup Recovery Codes</div>
          <div style={S.muted}>Simpan kode ini di password manager. Setiap kode hanya bisa dipakai 1× kalau Anda kehilangan akses ke authenticator app.</div>
          <div style={S.backupGrid}>
            {backupCodes.map((c, i) => (
              <div key={i} style={S.backupCode}>{c}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button onClick={copyBackupCodes} style={S.btnSecondary}>📋 Copy semua</button>
            <button onClick={() => setBackupCodes(null)} style={S.btnPrimary}>✓ Sudah saya simpan</button>
          </div>
        </section>
      )}

      {/* STATUS = enabled → show disable section */}
      {status.enabled && !backupCodes && (
        <section style={S.card}>
          <div style={S.cardTitle}>Matikan 2FA</div>
          <div style={S.muted}>
            Aktif sejak: {status.enabled_at ? new Date(status.enabled_at * 1000).toLocaleString() : "-"}
            {status.last_used_at && <> · Terakhir dipakai: {new Date(status.last_used_at * 1000).toLocaleString()}</>}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={S.label}>Masukkan kode dari authenticator (atau backup code)</label>
            <input type="text" value={disableCode}
              onChange={e => setDisableCode(e.target.value)}
              placeholder="000000 atau XXXX-XXXX-XX"
              style={S.input} />
          </div>
          <button onClick={confirmDisable} disabled={busy || !disableCode}
            style={{ ...S.btnDanger, marginTop: 12, opacity: (busy || !disableCode) ? 0.5 : 1 }}>
            Matikan 2FA
          </button>
        </section>
      )}

      {/* STATUS = disabled → show enrollment flow */}
      {!status.enabled && !backupCodes && (
        <>
          {!setup ? (
            <section style={S.card}>
              <div style={S.cardTitle}>Aktifkan 2FA</div>
              <div style={S.muted}>
                Setelah aktif, login butuh password <b>plus</b> kode 6-digit dari aplikasi authenticator. Direkomendasikan untuk akun super-admin dan owner.
              </div>
              <ol style={S.steps}>
                <li>Install aplikasi authenticator (Google Authenticator / Authy / 1Password / Microsoft Authenticator).</li>
                <li>Klik "Mulai Setup" — scan QR code yang muncul.</li>
                <li>Masukkan 6-digit kode dari app untuk konfirmasi.</li>
                <li>Simpan 8 backup codes — wajib untuk recovery.</li>
              </ol>
              <button onClick={beginSetup} disabled={busy}
                style={{ ...S.btnPrimary, marginTop: 10, opacity: busy ? 0.5 : 1 }}>
                {busy ? "Memulai…" : "🔐 Mulai Setup"}
              </button>
            </section>
          ) : (
            <section style={S.card}>
              <div style={S.cardTitle}>Scan QR Code</div>
              <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 24, alignItems: "start", marginTop: 12 }}>
                <div style={{ background: "#f5f7fb", padding: 12, borderRadius: 12, lineHeight: 0, width: 240, height: 240, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {qrDataUrl ? <img src={qrDataUrl} alt="2FA QR" style={{ width: 216, height: 216 }} /> : <div style={S.muted}>Rendering…</div>}
                </div>
                <div>
                  <div style={S.muted}>Scan QR ini dengan authenticator app. Tidak bisa scan? Masukkan kunci ini secara manual:</div>
                  <div style={S.secretBox}>{setup.secret.match(/.{1,4}/g)?.join(" ")}</div>
                  <div style={{ marginTop: 18 }}>
                    <label style={S.label}>Kode verifikasi (6 digit dari app)</label>
                    <input type="text" inputMode="numeric" pattern="[0-9]*"
                      value={enableCode}
                      onChange={e => setEnableCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                      placeholder="000000"
                      style={{ ...S.input, fontSize: 22, letterSpacing: 8, textAlign: "center", fontFamily: "'Geist Mono',monospace" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                    <button onClick={() => setSetup(null)} style={S.btnSecondary}>Batal</button>
                    <button onClick={confirmEnable} disabled={busy || enableCode.length < 6}
                      style={{ ...S.btnPrimary, opacity: (busy || enableCode.length < 6) ? 0.5 : 1 }}>
                      {busy ? "Memverifikasi…" : "✓ Aktifkan 2FA"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const S = {
  page: { padding: 28, maxWidth: 880, margin: "0 auto", color: "#cdd5df", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" },
  muted: { color: "rgba(205,213,223,0.55)", fontSize: 13, lineHeight: 1.6 },
  badgeOk: { padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
    background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" },
  badgeOff: { padding: "6px 14px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
    background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  card: {
    padding: 22, borderRadius: 14, marginBottom: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    border: "1px solid rgba(255,255,255,0.07)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8, letterSpacing: "-0.2px" },
  steps: { margin: "12px 0 6px 0", paddingLeft: 20, color: "rgba(205,213,223,0.75)", fontSize: 13, lineHeight: 1.85 },
  label: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase" },
  input: { width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" },
  secretBox: { marginTop: 10, padding: "12px 14px", background: "rgba(0,0,0,0.35)", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)", fontFamily: "'Geist Mono',monospace", fontSize: 13,
    letterSpacing: 2, color: "#fbbf24", wordBreak: "break-all" },
  backupGrid: { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 },
  backupCode: { padding: "10px 14px", background: "rgba(0,0,0,0.35)", borderRadius: 8,
    border: "1px solid rgba(251,191,36,0.25)", fontFamily: "'Geist Mono',monospace", fontSize: 13,
    color: "#fbbf24", textAlign: "center", letterSpacing: 1.5 },
  btnPrimary: { padding: "11px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" },
  btnSecondary: { padding: "11px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#cdd5df", fontWeight: 600, cursor: "pointer",
    fontSize: 13, fontFamily: "inherit" },
  btnDanger: { padding: "11px 20px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.4)",
    background: "rgba(239,68,68,0.12)", color: "#fca5a5", fontWeight: 700, cursor: "pointer",
    fontSize: 13, fontFamily: "inherit" },
  alertOk: { padding: "12px 16px", borderRadius: 10, background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)", color: "#86efac", fontSize: 13, marginBottom: 14 },
  alertErr: { padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", fontSize: 13, marginBottom: 14 },
};
