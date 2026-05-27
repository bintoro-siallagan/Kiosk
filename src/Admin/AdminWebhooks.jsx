// src/Admin/AdminWebhooks.jsx
// White-label P4A — outbound webhook subscriptions UI.

import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";

const EVENT_CATALOG = [
  { group: "Orders", items: ["order.created", "order.paid", "order.cancelled"] },
  { group: "Payments", items: ["payment.completed", "payment.failed", "payment.refunded"] },
  { group: "Customers", items: ["customer.created", "customer.updated"] },
  { group: "Shift", items: ["shift.opened", "shift.closed"] },
  { group: "Cinema", items: ["booking.confirmed", "booking.cancelled"] },
  { group: "Inventory", items: ["inventory.low"] },
];

function apiHeaders() {
  const tok = localStorage.getItem("adminToken");
  return { "Content-Type": "application/json", ...(tok && { Authorization: "Bearer " + tok }) };
}

export default function AdminWebhooks() {
  const [hooks, setHooks] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", kind: "" });
  const [tab, setTab] = useState("hooks");

  async function refresh() {
    try {
      const [h, d] = await Promise.all([
        fetch(`${API_HOST}/api/webhooks`, { headers: apiHeaders() }).then(r => r.json()),
        fetch(`${API_HOST}/api/webhooks/deliveries?limit=80`, { headers: apiHeaders() }).then(r => r.json()),
      ]);
      setHooks(Array.isArray(h) ? h : []);
      setDeliveries(Array.isArray(d) ? d : []);
    } catch (e) {
      setMsg({ text: "Failed to load: " + e.message, kind: "error" });
    }
  }
  useEffect(() => { refresh(); }, []);

  async function createHook(form) {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const r = await fetch(`${API_HOST}/api/webhooks`, {
        method: "POST", headers: apiHeaders(), body: JSON.stringify(form),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setNewSecret({ id: r.id, secret: r.secret, url: r.url });
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    } finally { setBusy(false); }
  }

  async function toggleHook(h) {
    await fetch(`${API_HOST}/api/webhooks/${h.id}`, {
      method: "PATCH", headers: apiHeaders(),
      body: JSON.stringify({ is_active: !h.is_active }),
    });
    refresh();
  }

  async function deleteHook(h) {
    if (!confirm(`Hapus webhook ke ${h.url}?`)) return;
    await fetch(`${API_HOST}/api/webhooks/${h.id}`, { method: "DELETE", headers: apiHeaders() });
    refresh();
  }

  async function testHook(h) {
    await fetch(`${API_HOST}/api/webhooks/${h.id}/test`, { method: "POST", headers: apiHeaders() });
    setMsg({ text: `Test ping queued for ${h.url}. Cek tab Deliveries.`, kind: "ok" });
    setTimeout(refresh, 1500);
  }

  async function retryDelivery(d) {
    await fetch(`${API_HOST}/api/webhooks/deliveries/${d.id}/retry`, { method: "POST", headers: apiHeaders() });
    setTimeout(refresh, 1000);
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.h1}>Webhooks</div>
          <div style={S.muted}>karyaOS akan POST event ke URL Anda dengan signature HMAC-SHA256. Pakai untuk integrasi custom (Slack, ERP, accounting).</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={S.btnPrimary}>+ Tambah webhook</button>
      </div>

      {msg.text && (
        <div style={msg.kind === "error" ? S.alertErr : S.alertOk}>{msg.text}</div>
      )}

      {newSecret && (
        <section style={{ ...S.card, borderColor: "rgba(251,191,36,0.4)" }}>
          <div style={S.cardTitle}>⚠ Simpan secret ini — hanya ditampilkan sekali</div>
          <div style={S.muted}>Pakai secret ini di server Anda untuk verifikasi signature pakai HMAC-SHA256.</div>
          <div style={S.secretBox}>{newSecret.secret}</div>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button onClick={() => { navigator.clipboard?.writeText(newSecret.secret); setMsg({ text: "Secret disalin ke clipboard.", kind: "ok" }); }}
              style={S.btnSecondary}>📋 Copy</button>
            <button onClick={() => setNewSecret(null)} style={S.btnPrimary}>✓ Sudah saya simpan</button>
          </div>
        </section>
      )}

      <div style={S.tabs}>
        <button onClick={() => setTab("hooks")} style={tab === "hooks" ? S.tabActive : S.tab}>Subscriptions ({hooks.length})</button>
        <button onClick={() => setTab("deliveries")} style={tab === "deliveries" ? S.tabActive : S.tab}>Recent Deliveries</button>
        <button onClick={() => setTab("verify")} style={tab === "verify" ? S.tabActive : S.tab}>Signature Verify Guide</button>
      </div>

      {tab === "hooks" && (
        <section>
          {hooks.length === 0 ? (
            <div style={S.empty}>Belum ada webhook. Klik "+ Tambah webhook" untuk mulai.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {hooks.map(h => (
                <div key={h.id} style={S.hookCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.hookUrl}>{h.url}</div>
                      {h.description && <div style={S.muted}>{h.description}</div>}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {h.events.map(e => <span key={e} style={S.eventPill}>{e}</span>)}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(205,213,223,0.5)" }}>
                        Last delivery: {h.last_delivery_at ? new Date(h.last_delivery_at * 1000).toLocaleString() + " · HTTP " + (h.last_status || "?") : "never"}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                      <span style={h.is_active ? S.badgeOk : S.badgeOff}>{h.is_active ? "ACTIVE" : "PAUSED"}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => testHook(h)} style={S.btnTiny} title="Test ping">▶ Test</button>
                        <button onClick={() => toggleHook(h)} style={S.btnTiny}>{h.is_active ? "Pause" : "Resume"}</button>
                        <button onClick={() => deleteHook(h)} style={{ ...S.btnTiny, color: "#fca5a5" }}>Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "deliveries" && (
        <section>
          {deliveries.length === 0 ? (
            <div style={S.empty}>Belum ada delivery.</div>
          ) : (
            <div style={S.table}>
              <div style={{ ...S.row, ...S.rowHead }}>
                <div style={{ width: 60 }}>ID</div>
                <div style={{ flex: 1 }}>Event</div>
                <div style={{ width: 90 }}>Status</div>
                <div style={{ width: 70 }}>HTTP</div>
                <div style={{ width: 70 }}>Tries</div>
                <div style={{ width: 160 }}>Created</div>
                <div style={{ width: 80 }}></div>
              </div>
              {deliveries.map(d => (
                <div key={d.id} style={S.row}>
                  <div style={{ width: 60, color: "rgba(205,213,223,0.45)", fontFamily: "monospace" }}>#{d.id}</div>
                  <div style={{ flex: 1, fontFamily: "monospace", fontSize: 12 }}>{d.event}</div>
                  <div style={{ width: 90 }}>
                    <span style={S[`status_${d.status}`] || S.status_pending}>{d.status}</span>
                  </div>
                  <div style={{ width: 70, fontFamily: "monospace", color: d.last_status_code >= 200 && d.last_status_code < 300 ? "#86efac" : "#fca5a5" }}>
                    {d.last_status_code || "—"}
                  </div>
                  <div style={{ width: 70, color: "rgba(205,213,223,0.6)" }}>{d.attempts}</div>
                  <div style={{ width: 160, fontSize: 11, color: "rgba(205,213,223,0.55)" }}>
                    {new Date(d.created_at * 1000).toLocaleString()}
                  </div>
                  <div style={{ width: 80 }}>
                    {(d.status === "failed" || d.status === "abandoned") && (
                      <button onClick={() => retryDelivery(d)} style={S.btnTiny}>Retry</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "verify" && <VerifyGuide />}

      {showCreate && (
        <CreateWebhookModal
          onClose={() => setShowCreate(false)}
          onSubmit={createHook}
          busy={busy}
        />
      )}
    </div>
  );
}

function CreateWebhookModal({ onClose, onSubmit, busy }) {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [events, setEvents] = useState(["order.created", "payment.completed"]);

  function toggle(e) {
    setEvents(arr => arr.includes(e) ? arr.filter(x => x !== e) : [...arr, e]);
  }

  return (
    <div style={S.modalRoot} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.cardTitle}>Tambah webhook</div>
        <label style={S.label}>URL endpoint</label>
        <input value={url} onChange={e => setUrl(e.target.value)}
          placeholder="https://api.your-system.com/karyaos-webhook" style={S.input} />
        <label style={{ ...S.label, marginTop: 14 }}>Deskripsi (opsional)</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Slack notifier for managers" style={S.input} />
        <label style={{ ...S.label, marginTop: 14 }}>Events ({events.length} dipilih)</label>
        <div style={{ display: "grid", gap: 10, maxHeight: 280, overflow: "auto", padding: "6px 2px" }}>
          {EVENT_CATALOG.map(g => (
            <div key={g.group}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>{g.group}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {g.items.map(e => (
                  <button key={e} onClick={() => toggle(e)}
                    style={events.includes(e) ? S.eventPillActive : S.eventPill}>
                    {events.includes(e) ? "✓ " : ""}{e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={S.btnSecondary}>Batal</button>
          <button onClick={() => onSubmit({ url, events, description })}
            disabled={busy || !url || events.length === 0}
            style={{ ...S.btnPrimary, opacity: (busy || !url || events.length === 0) ? 0.5 : 1 }}>
            {busy ? "Menyimpan…" : "Buat webhook"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VerifyGuide() {
  const example = `// Node.js verification example
const crypto = require('crypto');

app.post('/karyaos-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-karyaos-signature']; // "sha256=<hex>"
  const expected = 'sha256=' + crypto
    .createHmac('sha256', YOUR_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');

  if (signature !== expected) {
    return res.status(401).send('invalid signature');
  }
  const event = JSON.parse(req.body.toString());
  // event = { id, event, company_id, created_at, data }
  console.log('Got', event.event, event.data);
  res.send('OK');
});`;
  return (
    <section style={S.card}>
      <div style={S.cardTitle}>Cara verify signature</div>
      <div style={S.muted}>Setiap request membawa header <code>X-KaryaOS-Signature: sha256=&lt;hex&gt;</code>. Hitung HMAC-SHA256 dari body request mentah pakai secret webhook Anda, bandingkan dengan header.</div>
      <pre style={S.code}>{example}</pre>
      <div style={{ marginTop: 14, fontSize: 12, color: "rgba(205,213,223,0.65)" }}>
        Retry policy: 6× dengan backoff 30s → 2m → 8m → 30m → 2h → 8h. Timeout 10 detik per request.
        Respons HTTP 2xx dianggap sukses. Kalau gagal terus, status berubah jadi <code>abandoned</code>.
      </div>
    </section>
  );
}

const S = {
  page: { padding: 28, maxWidth: 1080, margin: "0 auto", color: "#cdd5df", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" },
  muted: { color: "rgba(205,213,223,0.55)", fontSize: 13, lineHeight: 1.6 },
  card: { padding: 22, borderRadius: 14, marginBottom: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    border: "1px solid rgba(255,255,255,0.07)" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 },
  empty: { padding: 40, textAlign: "center", color: "rgba(205,213,223,0.4)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12 },
  tabs: { display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 0 },
  tab: { padding: "10px 16px", background: "transparent", border: "none", color: "rgba(205,213,223,0.6)",
    fontSize: 13, fontWeight: 600, cursor: "pointer", borderBottom: "2px solid transparent", fontFamily: "inherit" },
  tabActive: { padding: "10px 16px", background: "transparent", border: "none", color: "#fff",
    fontSize: 13, fontWeight: 700, cursor: "pointer", borderBottom: "2px solid var(--brand-primary, #FF6B35)", fontFamily: "inherit" },
  hookCard: { padding: 16, borderRadius: 12, background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.06)" },
  hookUrl: { fontFamily: "monospace", fontSize: 13, color: "#fff", wordBreak: "break-all" },
  eventPill: { padding: "3px 9px", borderRadius: 999, fontSize: 11, background: "rgba(99,102,241,0.12)",
    border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc", fontFamily: "monospace", cursor: "pointer" },
  eventPillActive: { padding: "3px 9px", borderRadius: 999, fontSize: 11, background: "rgba(99,102,241,0.4)",
    border: "1px solid rgba(99,102,241,0.6)", color: "#fff", fontFamily: "monospace", cursor: "pointer", fontWeight: 600 },
  badgeOk: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" },
  badgeOff: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  status_success: { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" },
  status_pending: { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: "rgba(251,191,36,0.15)", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.3)" },
  status_failed: { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" },
  status_abandoned: { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 700,
    background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  table: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" },
  row: { display: "flex", alignItems: "center", padding: "10px 14px", gap: 12, fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowHead: { fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase",
    background: "rgba(0,0,0,0.2)", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  label: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase" },
  input: { width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" },
  secretBox: { marginTop: 10, padding: "12px 14px", background: "rgba(0,0,0,0.35)", borderRadius: 10,
    border: "1px solid rgba(251,191,36,0.25)", fontFamily: "monospace", fontSize: 13,
    letterSpacing: 1, color: "#fbbf24", wordBreak: "break-all" },
  code: { marginTop: 12, padding: "14px 16px", background: "rgba(0,0,0,0.45)", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontFamily: "'Geist Mono',monospace",
    color: "#cdd5df", overflow: "auto", whiteSpace: "pre" },
  btnPrimary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" },
  btnSecondary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#cdd5df", fontWeight: 600, cursor: "pointer",
    fontSize: 13, fontFamily: "inherit" },
  btnTiny: { padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: "#cdd5df", fontWeight: 600, cursor: "pointer",
    fontSize: 11, fontFamily: "inherit" },
  alertOk: { padding: "12px 16px", borderRadius: 10, background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)", color: "#86efac", fontSize: 13, marginBottom: 14 },
  alertErr: { padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", fontSize: 13, marginBottom: 14 },
  modalRoot: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000, padding: 20 },
  modal: { background: "linear-gradient(180deg, #1a1d29 0%, #131620 100%)", borderRadius: 18,
    padding: 28, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto",
    border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" },
};
