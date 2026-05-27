// src/Admin/AdminApiKeys.jsx
// White-label P4B — tenant public-API key management.

import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";

function apiHeaders() {
  const tok = localStorage.getItem("adminToken");
  return { "Content-Type": "application/json", ...(tok && { Authorization: "Bearer " + tok }) };
}

export default function AdminApiKeys() {
  const [keys, setKeys] = useState([]);
  const [allScopes, setAllScopes] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [msg, setMsg] = useState({ text: "", kind: "" });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [k, s] = await Promise.all([
        fetch(`${API_HOST}/api/api-keys`, { headers: apiHeaders() }).then(r => r.json()),
        fetch(`${API_HOST}/api/api-keys/scopes`).then(r => r.json()),
      ]);
      setKeys(Array.isArray(k) ? k : []);
      setAllScopes(Array.isArray(s) ? s : []);
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    }
  }
  useEffect(() => { refresh(); }, []);

  async function createKey(form) {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const r = await fetch(`${API_HOST}/api/api-keys`, {
        method: "POST", headers: apiHeaders(), body: JSON.stringify(form),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setNewKey(r);
      setShowCreate(false);
      await refresh();
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    } finally { setBusy(false); }
  }

  async function toggleKey(k) {
    await fetch(`${API_HOST}/api/api-keys/${k.id}`, {
      method: "PATCH", headers: apiHeaders(),
      body: JSON.stringify({ is_active: !k.is_active }),
    });
    refresh();
  }

  async function revokeKey(k) {
    if (!confirm(`Revoke API key "${k.name || k.display}"? Tindakan ini tidak bisa dibatalkan.`)) return;
    await fetch(`${API_HOST}/api/api-keys/${k.id}`, { method: "DELETE", headers: apiHeaders() });
    refresh();
  }

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.h1}>API Keys</div>
          <div style={S.muted}>Buat REST API key untuk membaca data karyaOS dari sistem eksternal. Setiap key di-scope ke company Anda. Endpoint: <code>{API_HOST}/api/public/*</code></div>
        </div>
        <button onClick={() => setShowCreate(true)} style={S.btnPrimary}>+ Generate key</button>
      </div>

      {msg.text && <div style={msg.kind === "error" ? S.alertErr : S.alertOk}>{msg.text}</div>}

      {newKey && (
        <section style={{ ...S.card, borderColor: "rgba(251,191,36,0.4)" }}>
          <div style={S.cardTitle}>⚠ Salin API key sekarang — hanya ditampilkan satu kali</div>
          <div style={S.muted}>Setelah dialog ini ditutup, key ini <b>tidak bisa</b> dilihat lagi. Simpan di password manager / .env Anda.</div>
          <div style={S.secretBox}>{newKey.key}</div>
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button onClick={() => { navigator.clipboard?.writeText(newKey.key); setMsg({ text: "API key disalin.", kind: "ok" }); }}
              style={S.btnSecondary}>📋 Copy</button>
            <button onClick={() => setNewKey(null)} style={S.btnPrimary}>✓ Sudah saya simpan</button>
          </div>
        </section>
      )}

      <section>
        {keys.length === 0 ? (
          <div style={S.empty}>Belum ada API key.</div>
        ) : (
          <div style={S.table}>
            <div style={{ ...S.row, ...S.rowHead }}>
              <div style={{ flex: 1 }}>Name</div>
              <div style={{ width: 180, fontFamily: "monospace" }}>Key</div>
              <div style={{ width: 220 }}>Scopes</div>
              <div style={{ width: 100 }}>Rate/min</div>
              <div style={{ width: 110 }}>Status</div>
              <div style={{ width: 140 }}>Last used</div>
              <div style={{ width: 90 }}>Calls</div>
              <div style={{ width: 150 }}></div>
            </div>
            {keys.map(k => (
              <div key={k.id} style={S.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 600 }}>{k.name || "Untitled"}</div>
                  <div style={{ fontSize: 11, color: "rgba(205,213,223,0.4)" }}>
                    Created {new Date(k.created_at * 1000).toLocaleDateString()}
                    {k.expires_at && <> · Expires {new Date(k.expires_at * 1000).toLocaleDateString()}</>}
                  </div>
                </div>
                <div style={{ width: 180, fontFamily: "monospace", fontSize: 12, color: "rgba(205,213,223,0.65)" }}>{k.display}</div>
                <div style={{ width: 220, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(k.scopes || []).map(s => <span key={s} style={S.scopePill}>{s}</span>)}
                </div>
                <div style={{ width: 100, color: "rgba(205,213,223,0.7)" }}>{k.rate_per_min}</div>
                <div style={{ width: 110 }}>
                  <span style={k.is_active ? S.badgeOk : S.badgeOff}>{k.is_active ? "ACTIVE" : "PAUSED"}</span>
                </div>
                <div style={{ width: 140, fontSize: 11, color: "rgba(205,213,223,0.55)" }}>
                  {k.last_used_at ? new Date(k.last_used_at * 1000).toLocaleString() : "never"}
                </div>
                <div style={{ width: 90, color: "rgba(205,213,223,0.6)" }}>{k.usage_count}</div>
                <div style={{ width: 150, display: "flex", gap: 6 }}>
                  <button onClick={() => toggleKey(k)} style={S.btnTiny}>{k.is_active ? "Pause" : "Resume"}</button>
                  <button onClick={() => revokeKey(k)} style={{ ...S.btnTiny, color: "#fca5a5" }}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <UsageDocs />

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onSubmit={createKey}
          allScopes={allScopes}
          busy={busy}
        />
      )}
    </div>
  );
}

function CreateKeyModal({ onClose, onSubmit, allScopes, busy }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["read:orders", "read:menu"]);
  const [ratePerMin, setRatePerMin] = useState(120);
  const [expiresInDays, setExpiresInDays] = useState("");

  function toggle(s) {
    setScopes(arr => arr.includes(s) ? arr.filter(x => x !== s) : [...arr, s]);
  }

  return (
    <div style={S.modalRoot} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.cardTitle}>Generate API key</div>
        <label style={S.label}>Nama key</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Custom reporting dashboard" style={S.input} />

        <label style={{ ...S.label, marginTop: 14 }}>Scopes ({scopes.length} dipilih)</label>
        <div style={{ display: "grid", gap: 8 }}>
          {allScopes.map(s => (
            <label key={s.id} style={S.scopeRow}>
              <input type="checkbox" checked={scopes.includes(s.id)}
                onChange={() => toggle(s.id)} />
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#fff" }}>{s.id}</div>
                <div style={S.muted}>{s.label}</div>
              </div>
            </label>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={S.label}>Rate limit (req/min)</label>
            <input type="number" min="1" max="6000" value={ratePerMin}
              onChange={e => setRatePerMin(Number(e.target.value))} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Expires in (days)</label>
            <input type="number" min="0" value={expiresInDays}
              onChange={e => setExpiresInDays(e.target.value)}
              placeholder="kosong = tidak expire" style={S.input} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={S.btnSecondary}>Batal</button>
          <button onClick={() => onSubmit({
              name,
              scopes,
              rate_per_min: ratePerMin,
              expires_in_days: expiresInDays ? Number(expiresInDays) : undefined,
            })}
            disabled={busy || scopes.length === 0}
            style={{ ...S.btnPrimary, opacity: (busy || scopes.length === 0) ? 0.5 : 1 }}>
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageDocs() {
  const example = `curl -H "Authorization: Bearer ks_live_XXXXXXXX..." \\
  ${API_HOST}/api/public/orders?limit=10

# Available endpoints (scope required in parentheses):
GET /api/public/me                        # check who you are
GET /api/public/orders        (read:orders)
GET /api/public/orders/:id    (read:orders)
GET /api/public/menu          (read:menu)
GET /api/public/customers     (read:customers)
GET /api/public/reports/sales-summary?days=7  (read:reports)

# Rate-limit headers on every response:
X-RateLimit-Limit:     120
X-RateLimit-Remaining: 119`;
  return (
    <section style={{ ...S.card, marginTop: 24 }}>
      <div style={S.cardTitle}>Cara pakai</div>
      <pre style={S.code}>{example}</pre>
    </section>
  );
}

const S = {
  page: { padding: 28, maxWidth: 1180, margin: "0 auto", color: "#cdd5df", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 24 },
  h1: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" },
  muted: { color: "rgba(205,213,223,0.55)", fontSize: 13, lineHeight: 1.6 },
  card: { padding: 22, borderRadius: 14, marginBottom: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    border: "1px solid rgba(255,255,255,0.07)" },
  cardTitle: { fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 8 },
  empty: { padding: 40, textAlign: "center", color: "rgba(205,213,223,0.4)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12 },
  table: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, overflow: "hidden" },
  row: { display: "flex", alignItems: "center", padding: "12px 14px", gap: 12, fontSize: 13, borderBottom: "1px solid rgba(255,255,255,0.04)" },
  rowHead: { fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 1, textTransform: "uppercase",
    background: "rgba(0,0,0,0.2)" },
  scopePill: { padding: "2px 7px", borderRadius: 999, fontSize: 10, background: "rgba(99,102,241,0.12)",
    border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc", fontFamily: "monospace" },
  scopeRow: { display: "flex", alignItems: "flex-start", gap: 10, padding: 10, borderRadius: 8,
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer" },
  badgeOk: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(34,197,94,0.15)", color: "#86efac", border: "1px solid rgba(34,197,94,0.3)" },
  badgeOff: { padding: "3px 9px", borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: 1,
    background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" },
  label: { display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#9ca3af", marginBottom: 6, textTransform: "uppercase" },
  input: { width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 14, fontFamily: "inherit", outline: "none" },
  secretBox: { marginTop: 10, padding: "14px 16px", background: "rgba(0,0,0,0.35)", borderRadius: 10,
    border: "1px solid rgba(251,191,36,0.25)", fontFamily: "monospace", fontSize: 13,
    letterSpacing: 0.5, color: "#fbbf24", wordBreak: "break-all" },
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
