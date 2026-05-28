// src/Admin/AdminNotifPreview.jsx
// Notification & receipt preview — tenant sees how WA, email, and thermal
// receipt look BEFORE going live, driven by current branding config.
//
// Reads from /api/companies/branding (logo, color, brand_short, address,
// contact_phone, wa_signature, email_signature, receipt_footer).
// Edits to signature/footer save back via PUT /api/companies/branding and
// preview re-renders instantly.

import { useEffect, useState } from "react";
import API_HOST from "../apiBase.js";
import { LoadingState } from "../components/uiKit.jsx";

function headers() {
  const tok = localStorage.getItem("adminToken");
  return { "Content-Type": "application/json", ...(tok && { Authorization: "Bearer " + tok }) };
}

const SAMPLE_ORDER = {
  id: "A1024",
  customer_name: "Sarah",
  customer_phone: "081294881634",
  total: 87000,
  items: [
    { name: "Iced Cappuccino", qty: 2, price: 28000 },
    { name: "Tuna Sandwich",   qty: 1, price: 31000 },
  ],
  type: "takeaway",
  table: null,
};

export default function AdminNotifPreview() {
  const [brand, setBrand] = useState(null);
  const [waCfg, setWaCfg] = useState(null);
  const [waStatus, setWaStatus] = useState("ready");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: "", kind: "" });
  const [draft, setDraft] = useState({ wa_signature: "", email_signature: "", receipt_footer: "" });
  const [view, setView] = useState("wa");

  async function refresh() {
    try {
      const [b, w] = await Promise.all([
        fetch(`${API_HOST}/api/companies/branding`).then(r => r.json()),
        fetch(`${API_HOST}/api/wa/config`).then(r => r.json()).catch(() => null),
      ]);
      setBrand(b);
      setWaCfg(w);
      setDraft({
        wa_signature: b?.wa_signature || "",
        email_signature: b?.email_signature || "",
        receipt_footer: b?.receipt_footer || "",
      });
    } catch (e) {
      setMsg({ text: "Failed to load: " + e.message, kind: "error" });
    }
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      await fetch(`${API_HOST}/api/companies/branding`, {
        method: "PUT", headers: headers(), body: JSON.stringify(draft),
      });
      await refresh();
      setMsg({ text: "Tersimpan ✓", kind: "ok" });
    } catch (e) {
      setMsg({ text: e.message, kind: "error" });
    } finally { setBusy(false); }
  }

  if (!brand) return <div style={S.page}><LoadingState label="Memuat…" /></div>;

  // Active values use draft (live preview) if user is editing
  const active = { ...brand, ...draft };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div>
          <div style={S.h1}>Notification Preview</div>
          <div style={S.muted}>Lihat preview WA, Email, dan struk thermal sebelum kirim. Edit signature di kiri, preview live di kanan.</div>
        </div>
        <button onClick={save} disabled={busy} style={S.btnPrimary}>
          {busy ? "Menyimpan…" : "💾 Simpan"}
        </button>
      </div>

      {msg.text && <div style={msg.kind === "error" ? S.alertErr : S.alertOk}>{msg.text}</div>}

      <div style={S.layout}>
        {/* LEFT — editor */}
        <div style={S.editorPanel}>
          <section style={S.card}>
            <div style={S.cardTitle}>WhatsApp signature</div>
            <div style={S.muted}>Otomatis di-append ke setiap WA notif yang dikirim ke pelanggan.</div>
            <textarea
              value={draft.wa_signature}
              onChange={e => setDraft(d => ({ ...d, wa_signature: e.target.value }))}
              placeholder={"— Karya Bites\nJl. Sudirman 123\nKomplain: 0812-9488-1634"}
              style={S.textarea}
              rows={4}
            />
          </section>
          <section style={S.card}>
            <div style={S.cardTitle}>Email signature</div>
            <div style={S.muted}>Otomatis di-append ke body email (mis. struk via email, password reset).</div>
            <textarea
              value={draft.email_signature}
              onChange={e => setDraft(d => ({ ...d, email_signature: e.target.value }))}
              placeholder={"Terima kasih,\nTeam Karya Bites\nhttps://karya.bites.com"}
              style={S.textarea}
              rows={4}
            />
          </section>
          <section style={S.card}>
            <div style={S.cardTitle}>Receipt footer</div>
            <div style={S.muted}>Muncul di bagian bawah struk thermal & digital receipt.</div>
            <textarea
              value={draft.receipt_footer}
              onChange={e => setDraft(d => ({ ...d, receipt_footer: e.target.value }))}
              placeholder={"Terima kasih atas kunjungan Anda!\nIkuti kami @karyabites"}
              style={S.textarea}
              rows={3}
            />
          </section>
        </div>

        {/* RIGHT — preview tabs */}
        <div>
          <div style={S.tabs}>
            <button onClick={() => setView("wa")}     style={view === "wa"      ? S.tabActive : S.tab}>📱 WhatsApp</button>
            <button onClick={() => setView("email")}  style={view === "email"   ? S.tabActive : S.tab}>📧 Email</button>
            <button onClick={() => setView("receipt")}style={view === "receipt" ? S.tabActive : S.tab}>🧾 Receipt</button>
          </div>
          {view === "wa" && waCfg && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#9ca3af", marginRight: 4 }}>Status:</span>
              {Object.keys(waCfg.templates || { ready: 1, completed: 1 }).map(st => (
                <button key={st} onClick={() => setWaStatus(st)}
                  style={waStatus === st ? S.tabActive : S.tab}>
                  {st === "ready" ? "🔔 Ready" : st === "completed" ? "✅ Completed" : st}
                </button>
              ))}
            </div>
          )}
          <div style={S.previewStage}>
            {view === "wa"      && <WhatsAppPreview brand={active} waCfg={waCfg} status={waStatus} />}
            {view === "email"   && <EmailPreview    brand={active} />}
            {view === "receipt" && <ReceiptPreview  brand={active} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp phone-bubble mockup ──────────────────────────────────────
// Renders the actual template from /api/wa/config with vars substituted —
// the same fillTemplate() logic the backend uses. Tenant sees exactly what
// the customer will receive for each status (ready / completed / dll).
function fillTpl(tpl, vars) {
  return String(tpl || "").replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);
}

function WhatsAppPreview({ brand, waCfg, status }) {
  const brandName = brand.brand_short || brand.name || "karyaos";
  const address = brand.address || "";
  const signature = brand.wa_signature || `— ${brandName}\n${address}`.trim();
  const template = waCfg?.templates?.[status];
  const vars = {
    customerName: SAMPLE_ORDER.customer_name,
    orderId:      SAMPLE_ORDER.id,
    total:        SAMPLE_ORDER.total,
    totalIDR:     SAMPLE_ORDER.total.toLocaleString("id-ID"),
    trackingUrl:  `https://app.karyaos.tech/?trackorder=${SAMPLE_ORDER.id}`,
    date:         new Date().toLocaleDateString("id-ID"),
    time:         new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    brandName, brandPhone: brand.contact_phone || "", brandAddress: address, signature,
  };
  let lines;
  if (template) {
    let body = fillTpl(template, vars);
    if (brand.wa_signature && !template.includes("{signature}")) body += `\n\n${brand.wa_signature}`;
    else if (!brand.wa_signature && !template.includes("{brandName}")) body += `\n\n— ${brandName}`;
    lines = body;
  } else {
    // Fallback when /api/wa/config unavailable
    lines = [
      `Halo *${SAMPLE_ORDER.customer_name}*! 👋`, "",
      `Pesanan kamu *#${SAMPLE_ORDER.id}* sudah *SIAP DIAMBIL* 🔔`, "",
      `Total: *Rp ${SAMPLE_ORDER.total.toLocaleString("id-ID")}*`,
      `Tunjukkan ID order ini ke kasir.`, "", signature,
    ].join("\n");
  }
  return (
    <div style={W.phoneFrame}>
      <div style={W.notch} />
      <div style={W.appBar}>
        <span style={{ fontSize: 18 }}>‹</span>
        <div style={W.avatar}>{(brandName[0] || "K").toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={W.contactName}>{brandName}</div>
          <div style={W.contactSub}>online</div>
        </div>
        <span style={{ fontSize: 16 }}>⋮</span>
      </div>
      <div style={W.chatArea}>
        <div style={W.bubble}>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{lines}</div>
          <div style={W.bubbleTime}>{new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Email mockup ──────────────────────────────────────────────────────
function EmailPreview({ brand }) {
  const brandName = brand.brand_short || brand.name || "karyaos";
  const color = brand.brand_color || "#FF6B35";
  const signature = brand.email_signature || `Terima kasih,\nTeam ${brandName}`;
  return (
    <div style={E.frame}>
      <div style={E.toolbar}>
        <div style={E.toolbarDots}>
          <span style={{ ...E.dot, background: "#ff5f57" }} />
          <span style={{ ...E.dot, background: "#febc2e" }} />
          <span style={{ ...E.dot, background: "#28c840" }} />
        </div>
        <div style={E.toolbarTitle}>Inbox — Pesanan #{SAMPLE_ORDER.id}</div>
      </div>
      <div style={E.meta}>
        <div><b>From:</b> {brandName} &lt;noreply@karyaos.com&gt;</div>
        <div><b>To:</b> {SAMPLE_ORDER.customer_name} &lt;sarah@example.com&gt;</div>
        <div><b>Subject:</b> Struk pesanan #{SAMPLE_ORDER.id}</div>
      </div>
      <div style={E.body}>
        {brand.logo_url && (
          <img src={brand.logo_url} alt={brandName}
            style={{ height: 44, marginBottom: 16, filter: "drop-shadow(0 0 8px rgba(0,0,0,0.05))" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        <div style={{ ...E.h, color }}>Pesanan Diterima — Terima kasih!</div>
        <p>Hi {SAMPLE_ORDER.customer_name},</p>
        <p>Pesanan <b>#{SAMPLE_ORDER.id}</b> kamu sudah kami terima.</p>
        <table style={E.table}>
          {SAMPLE_ORDER.items.map((it, i) => (
            <tr key={i}><td>{it.qty}× {it.name}</td><td style={{ textAlign: "right" }}>Rp {(it.qty*it.price).toLocaleString("id-ID")}</td></tr>
          ))}
          <tr style={{ borderTop: `2px solid ${color}` }}>
            <td><b>Total</b></td><td style={{ textAlign: "right", color, fontWeight: 700 }}>Rp {SAMPLE_ORDER.total.toLocaleString("id-ID")}</td>
          </tr>
        </table>
        <div style={E.signature}>{signature}</div>
      </div>
    </div>
  );
}

// ─── Thermal receipt mockup ───────────────────────────────────────────
function ReceiptPreview({ brand }) {
  const brandName = brand.brand_short || brand.name || "karyaos";
  const footer = brand.receipt_footer || "Terima kasih!\nIkuti @karyabites";
  return (
    <div style={R.paper}>
      <div style={R.center}>
        {brand.logo_url && (
          <img src={brand.logo_url} alt={brandName}
            style={{ height: 36, marginBottom: 6, filter: "grayscale(1) contrast(1.2)" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: 1 }}>{brandName.toUpperCase()}</div>
        {brand.address && <div style={R.small}>{brand.address}</div>}
        {brand.contact_phone && <div style={R.small}>{brand.contact_phone}</div>}
      </div>
      <div style={R.divider}>— — — — — — — — — — —</div>
      <div style={R.row}><span>Order #{SAMPLE_ORDER.id}</span><span>{new Date().toLocaleDateString("id-ID")}</span></div>
      <div style={R.row}><span>Pelanggan</span><span>{SAMPLE_ORDER.customer_name}</span></div>
      <div style={R.row}><span>Tipe</span><span>{SAMPLE_ORDER.type.toUpperCase()}</span></div>
      <div style={R.divider}>— — — — — — — — — — —</div>
      {SAMPLE_ORDER.items.map((it, i) => (
        <div key={i}>
          <div>{it.name}</div>
          <div style={R.row}><span>{it.qty} x Rp {it.price.toLocaleString("id-ID")}</span><span>Rp {(it.qty*it.price).toLocaleString("id-ID")}</span></div>
        </div>
      ))}
      <div style={R.divider}>— — — — — — — — — — —</div>
      <div style={R.row}><b>TOTAL</b><b>Rp {SAMPLE_ORDER.total.toLocaleString("id-ID")}</b></div>
      <div style={R.divider}>— — — — — — — — — — —</div>
      <div style={R.center}>
        <div style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 4 }}>{footer}</div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────
const S = {
  page: { padding: 28, maxWidth: 1280, margin: "0 auto", color: "#cdd5df", fontFamily: "'Inter', sans-serif" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 22 },
  h1: { fontSize: 22, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" },
  muted: { color: "rgba(205,213,223,0.55)", fontSize: 13, lineHeight: 1.6 },
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 28, alignItems: "start" },
  editorPanel: { display: "flex", flexDirection: "column", gap: 14 },
  card: { padding: 18, borderRadius: 14,
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
    border: "1px solid rgba(255,255,255,0.07)" },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 4 },
  textarea: { width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 10,
    background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff", fontSize: 13, fontFamily: "'Inter', sans-serif", outline: "none",
    resize: "vertical", boxSizing: "border-box" },
  tabs: { display: "flex", gap: 6, marginBottom: 16,
    background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.05)" },
  tab: { flex: 1, padding: "8px 12px", borderRadius: 8, border: "none",
    background: "transparent", color: "rgba(205,213,223,0.6)",
    fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  tabActive: { flex: 1, padding: "8px 12px", borderRadius: 8, border: "none",
    background: "rgba(255,255,255,0.08)", color: "#fff",
    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)" },
  previewStage: { padding: 24, borderRadius: 18,
    background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,0,0,0.3), transparent 70%)",
    minHeight: 480, display: "flex", alignItems: "center", justifyContent: "center" },
  btnPrimary: { padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)",
    background: "linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" },
  alertOk: { padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.1)",
    border: "1px solid rgba(34,197,94,0.25)", color: "#86efac", fontSize: 13, marginBottom: 14 },
  alertErr: { padding: "10px 14px", borderRadius: 10, background: "rgba(239,68,68,0.1)",
    border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5", fontSize: 13, marginBottom: 14 },
};

// WhatsApp mockup
const W = {
  phoneFrame: { width: 320, background: "#0f1318", borderRadius: 32,
    padding: 6, boxShadow: "0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
    border: "1px solid #1a1f26" },
  notch: { width: 70, height: 18, background: "#000", borderRadius: "0 0 14px 14px",
    margin: "0 auto 4px", display: "block" },
  appBar: { display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
    background: "#075e54", color: "#fff", borderRadius: "26px 26px 0 0" },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: "#fff",
    color: "#075e54", display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 14 },
  contactName: { fontSize: 13, fontWeight: 700 },
  contactSub: { fontSize: 11, opacity: 0.7 },
  chatArea: { background: "#ece5dd", padding: "14px 10px", minHeight: 320, borderRadius: "0 0 26px 26px",
    backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='20' cy='20' r='1' fill='%23d4ccb5' opacity='0.5'/></svg>\")" },
  bubble: { background: "#fff", padding: "8px 10px", borderRadius: "0 8px 8px 8px",
    maxWidth: "92%", fontSize: 12, color: "#1f2937", boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
    fontFamily: "'Inter', sans-serif" },
  bubbleTime: { fontSize: 10, color: "#88959c", textAlign: "right", marginTop: 4 },
};

// Email mockup
const E = {
  frame: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: 12, overflow: "hidden",
    boxShadow: "0 24px 60px rgba(0,0,0,0.4)", border: "1px solid #e5e7eb",
    color: "#1f2937", fontFamily: "'Inter', sans-serif" },
  toolbar: { background: "#f3f4f6", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
    borderBottom: "1px solid #e5e7eb" },
  toolbarDots: { display: "flex", gap: 5 },
  dot: { width: 10, height: 10, borderRadius: "50%", display: "block" },
  toolbarTitle: { fontSize: 11, color: "#6b7280", fontWeight: 600 },
  meta: { padding: "12px 18px", borderBottom: "1px solid #e5e7eb", fontSize: 12,
    color: "#4b5563", lineHeight: 1.7 },
  body: { padding: "20px 18px", fontSize: 13, lineHeight: 1.6 },
  h: { fontSize: 18, fontWeight: 700, margin: "0 0 12px" },
  table: { width: "100%", margin: "14px 0", borderCollapse: "collapse" },
  signature: { marginTop: 24, paddingTop: 14, borderTop: "1px solid #e5e7eb",
    whiteSpace: "pre-wrap", color: "#6b7280", fontSize: 12 },
};

// Thermal receipt mockup
const R = {
  paper: { width: 280, background: "#fefefe", color: "#000",
    fontFamily: "'Courier New', 'Geist Mono', monospace", fontSize: 11.5,
    padding: "16px 14px", boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
    borderRadius: "2px 2px 6px 6px",
    backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.02) 0 1px, transparent 1px 4px)" },
  center: { textAlign: "center" },
  small: { fontSize: 10 },
  divider: { textAlign: "center", margin: "6px 0", letterSpacing: 1 },
  row: { display: "flex", justifyContent: "space-between" },
};
