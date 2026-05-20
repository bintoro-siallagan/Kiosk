/**
 * AdminPaymentGateway.jsx — config UI buat Payment Gateway (Midtrans + Xendit).
 * Dipakai sebagai tab di AdminTools. Endpoint backend: /api/payment-gateway/*
 *
 * Props:
 *   apiBase — HOST backend (mis. http://localhost:3001).
 *             Komponen nempel "/api/payment-gateway/..." sendiri.
 */
import { useState, useEffect, useCallback } from "react";

const fR = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

const S = {
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 14, padding: 20, marginBottom: 16 },
  label: { fontSize: 11, color: "#555", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, fontFamily: "'Space Mono',monospace" },
  input: { width: "100%", background: "#0a0e16", border: "1px solid #21262d", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" },
  fieldLabel: { fontSize: 11, color: "#666", marginBottom: 4 },
  btn: (color = "#22D3EE") => ({ background: color + "18", border: `1px solid ${color}44`, borderRadius: 8, padding: "10px 18px", color, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }),
  badge: (color) => ({ background: color + "22", color, padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 600 }),
  chip: { background: "#161b22", color: "#8b949e", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontFamily: "'Space Mono',monospace" },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
};

const STATUS_COLOR = { paid: "#34D399", pending: "#F59E0B", expired: "#6b7280", cancelled: "#6b7280", failed: "#F87171" };

// ── Card config per provider ────────────────────────────────────────
function ProviderCard({ apiBase, provider, onSaved, showToast }) {
  const [form, setForm] = useState({
    server_key: "", client_key: "", callback_token: "",
    merchant_id: provider.merchant_id || "",
    environment: provider.environment || "sandbox",
    is_active: !!provider.is_active,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    // Field key dikirim cuma kalau diisi — kosong = jangan ubah yang tersimpan.
    const body = { environment: form.environment, is_active: form.is_active, merchant_id: form.merchant_id };
    if (form.server_key.trim()) body.server_key = form.server_key.trim();
    if (form.client_key.trim()) body.client_key = form.client_key.trim();
    if (form.callback_token.trim()) body.callback_token = form.callback_token.trim();
    try {
      const r = await fetch(`${apiBase}/api/payment-gateway/providers/${provider.code}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      showToast(`✓ ${provider.name} tersimpan`);
      setForm((f) => ({ ...f, server_key: "", client_key: "", callback_token: "" }));
      onSaved();
    } catch (e) { showToast(`✗ ${e.message}`); }
    setSaving(false);
  };

  const accent = provider.code === "midtrans" ? "#3B82F6" : "#22D3EE";
  const methods = (provider.supported_methods || "").split(",").filter(Boolean);

  return (
    <div style={{ ...S.card, borderLeft: `4px solid ${accent}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{provider.name}</span>
          <span style={S.badge(provider.is_active ? "#34D399" : "#6b7280")}>{provider.is_active ? "AKTIF" : "OFF"}</span>
          <span style={S.badge(provider.environment === "production" ? "#F87171" : "#F59E0B")}>{provider.environment}</span>
        </div>
        <div style={{ fontSize: 11, color: "#555" }}>
          server_key {provider.has_server_key ? "✓" : "—"} · callback {provider.has_callback_token ? "✓" : "—"}
        </div>
      </div>

      <div style={S.grid2}>
        <div>
          <div style={S.fieldLabel}>
            Server Key {!!provider.has_server_key && <span style={{ color: "#34D399" }}>(tersimpan)</span>}
          </div>
          <input style={S.input} type="password" value={form.server_key}
            onChange={(e) => set("server_key", e.target.value)}
            placeholder={provider.has_server_key ? "•••••••• kosongkan kalau gak diubah" : "SB-Mid-server-... / xnd_..."} />
        </div>
        <div>
          <div style={S.fieldLabel}>Client Key <span style={{ color: "#444" }}>(opsional)</span></div>
          <input style={S.input} value={form.client_key}
            onChange={(e) => set("client_key", e.target.value)}
            placeholder="SB-Mid-client-..." />
        </div>
        <div>
          <div style={S.fieldLabel}>
            Callback Token {provider.code === "xendit"
              ? <span style={{ color: "#F59E0B" }}>(Xendit — wajib buat verifikasi webhook)</span>
              : <span style={{ color: "#444" }}>(opsional)</span>}
            {!!provider.has_callback_token && <span style={{ color: "#34D399" }}> ✓ tersimpan</span>}
          </div>
          <input style={S.input} type="password" value={form.callback_token}
            onChange={(e) => set("callback_token", e.target.value)}
            placeholder={provider.has_callback_token ? "•••••••• kosongkan kalau gak diubah" : "x-callback-token"} />
        </div>
        <div>
          <div style={S.fieldLabel}>Merchant ID <span style={{ color: "#444" }}>(opsional)</span></div>
          <input style={S.input} value={form.merchant_id}
            onChange={(e) => set("merchant_id", e.target.value)} placeholder="G1234567" />
        </div>
        <div>
          <div style={S.fieldLabel}>Environment</div>
          <select style={{ ...S.input, cursor: "pointer" }} value={form.environment}
            onChange={(e) => set("environment", e.target.value)}>
            <option value="sandbox">sandbox (testing)</option>
            <option value="production">production (live)</option>
          </select>
        </div>
        <div>
          <div style={S.fieldLabel}>Status</div>
          <button onClick={() => set("is_active", !form.is_active)}
            style={{ ...S.input, cursor: "pointer", textAlign: "left", color: form.is_active ? "#34D399" : "#6b7280" }}>
            {form.is_active ? "🟢 Aktif — tampil di POS" : "⚪ Nonaktif — sembunyi dari POS"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 14px" }}>
        {methods.map((m) => <span key={m} style={S.chip}>{m}</span>)}
      </div>

      <button onClick={save} disabled={saving} style={{ ...S.btn(accent), opacity: saving ? 0.5 : 1 }}>
        {saving ? "Menyimpan..." : `💾 Simpan ${provider.name}`}
      </button>
    </div>
  );
}

// ── Tab utama ───────────────────────────────────────────────────────
export default function AdminPaymentGateway({ apiBase = "" }) {
  const [providers, setProviders] = useState([]);
  const [recon, setRecon] = useState(null);
  const [intents, setIntents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, rc, it] = await Promise.all([
        fetch(`${apiBase}/api/payment-gateway/providers`).then((r) => r.json()),
        fetch(`${apiBase}/api/payment-gateway/reconcile`).then((r) => r.json()).catch(() => null),
        fetch(`${apiBase}/api/payment-gateway/intents?limit=15`).then((r) => r.json()).catch(() => []),
      ]);
      setProviders(Array.isArray(p) ? p : []);
      setRecon(rc);
      setIntents(Array.isArray(it) ? it : []);
    } catch (e) { showToast(`✗ ${e.message}`); }
    setLoading(false);
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const copy = (txt) => { navigator.clipboard?.writeText(txt); showToast("✓ URL disalin"); };

  if (loading) return <div style={{ color: "#555", padding: 20 }}>Loading payment gateway...</div>;

  return (
    <div>
      <div style={{ ...S.card, background: "#0a1422", border: "1px solid #15324d" }}>
        <div style={{ ...S.label, color: "#5fa8d3" }}>💳 Payment Gateway — Midtrans + Xendit</div>
        <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>
          Isi API key dari dashboard provider, pilih <b>environment</b>, lalu aktifkan. Provider yang
          aktif otomatis muncul di POS waktu kasir pilih QRIS / e-wallet.
        </div>
      </div>

      {providers.length === 0 && (
        <div style={{ ...S.card, color: "#F87171" }}>
          Provider belum ke-load — pastikan backend jalan & module payment-gateway aktif.
        </div>
      )}

      {providers.map((p) => (
        <ProviderCard key={p.code} apiBase={apiBase} provider={p} onSaved={load} showToast={showToast} />
      ))}

      {/* Webhook URL */}
      <div style={S.card}>
        <div style={S.label}>🔔 Webhook URL — daftarkan di dashboard provider</div>
        {[
          { label: "Midtrans — Payment Notification URL", url: `${apiBase}/api/payment-gateway/webhook/midtrans` },
          { label: "Xendit — Callback / Webhook URL", url: `${apiBase}/api/payment-gateway/webhook/xendit` },
        ].map((w) => (
          <div key={w.url} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>{w.label}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...S.input, fontFamily: "'Space Mono',monospace", fontSize: 12 }} readOnly value={w.url} />
              <button onClick={() => copy(w.url)} style={S.btn("#22D3EE")}>Copy</button>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "#6b6b55", marginTop: 8, lineHeight: 1.5 }}>
          ⚠ URL ini harus bisa diakses dari internet — provider yang nge-call. Kalau backend masih di
          localhost, pakai tunnel (ngrok / cloudflared) dan daftarkan URL publiknya ke dashboard provider.
        </div>
      </div>

      {/* Rekonsiliasi */}
      {recon?.totals && (
        <div style={S.card}>
          <div style={S.label}>📊 Rekonsiliasi Hari Ini</div>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {[
              { k: "Intent", v: recon.totals.intents, c: "#fff" },
              { k: "Lunas", v: recon.totals.paid, c: "#34D399" },
              { k: "Expired", v: recon.totals.expired, c: "#6b7280" },
              { k: "Total Masuk", v: fR(recon.totals.amount), c: "#34D399" },
            ].map((x) => (
              <div key={x.k}>
                <div style={{ fontSize: 11, color: "#555" }}>{x.k}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: x.c, fontFamily: "'Space Mono',monospace" }}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intent terbaru */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ ...S.label, marginBottom: 0 }}>🧾 Payment Intent Terbaru ({intents.length})</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { const a = document.createElement("a"); a.href = `${apiBase}/api/payment-gateway/export/intents.csv`; a.click(); }} style={S.btn("#34D399")}>⬇️ Export CSV</button>
            <button onClick={load} style={S.btn("#555")}>🔄 Refresh</button>
          </div>
        </div>
        {intents.length === 0
          ? <div style={{ color: "#555", padding: 12 }}>Belum ada transaksi gateway</div>
          : intents.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #0f1629", gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  <span style={{ fontFamily: "'Space Mono',monospace", color: "#8b949e" }}>{it.doc_no}</span>
                  {" · "}{it.provider_code} / {it.payment_method}
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>
                  {it.order_ref || "—"} · {new Date((it.created_at || 0) * 1000).toLocaleString("id-ID")}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Space Mono',monospace" }}>{fR(it.amount)}</div>
                <span style={S.badge(STATUS_COLOR[it.status] || "#6b7280")}>{it.status}</span>
              </div>
            </div>
          ))
        }
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#0d1117", border: "1px solid #21262d", color: "#fff", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 600, zIndex: 10000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
