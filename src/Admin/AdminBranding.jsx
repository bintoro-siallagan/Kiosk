// src/Admin/AdminBranding.jsx
// Per-tenant branding settings — logo, brand color, name.
// White-label foundation: this is what makes the kiosk feel like THEIR product.

import { useEffect, useState, useRef, useCallback } from "react";

export default function AdminBranding({ onBack }) {
  const [data, setData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    brand_color: "", name: "", brand_short: "",
    contact_email: "", contact_phone: "", address: "",
    receipt_footer: "", wa_signature: "", email_signature: "",
    currency_code: "IDR", locale: "id-ID",
  });
  const fileRef = useRef(null);
  const setF = (k) => (e) => setForm(s => ({ ...s, [k]: e.target.value }));

  const load = useCallback(() => {
    fetch("/api/companies/branding")
      .then(r => r.json())
      .then(b => {
        setData(b);
        setForm({
          brand_color: b?.brand_color || "#FF6B35",
          name: b?.name || "",
          brand_short: b?.brand_short || "",
          contact_email: b?.contact_email || "",
          contact_phone: b?.contact_phone || "",
          address: b?.address || "",
          receipt_footer: b?.receipt_footer || "",
          wa_signature: b?.wa_signature || "",
          email_signature: b?.email_signature || "",
          currency_code: b?.currency_code || "IDR",
          locale: b?.locale || "id-ID",
        });
      });
  }, []);
  useEffect(load, [load]);

  async function uploadLogo(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("logo", file);
    try {
      const r = await fetch("/api/companies/branding/logo", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "upload failed");
      load();
    } catch (e) { alert("✗ " + e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function removeLogo() {
    if (!confirm("Hapus logo tenant? Akan fallback ke karyaos default.")) return;
    try {
      await fetch("/api/companies/branding/logo", { method: "DELETE" });
      load();
    } catch (e) { alert("✗ " + e.message); }
  }

  async function saveBranding() {
    setSaving(true);
    try {
      const r = await fetch("/api/companies/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      load();
      alert("✓ Branding saved");
    } catch (e) { alert("✗ " + e.message); }
    finally { setSaving(false); }
  }

  async function resetAllBranding() {
    if (!confirm("⚠️ HAPUS SEMUA branding custom? Logo, warna, nama, kontak, signature — semua reset ke default karyaos. Tidak bisa di-undo.")) return;
    setSaving(true);
    try {
      // Reset form fields ke default
      const reset = {
        brand_color: "#FF6B35", name: "", brand_short: "",
        contact_email: "", contact_phone: "", address: "",
        receipt_footer: "", wa_signature: "", email_signature: "",
        currency_code: "IDR", locale: "id-ID",
      };
      // Save kosong ke server
      const r = await fetch("/api/companies/branding", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      // Delete logo juga
      if (data.logo_url && data.logo_url !== "/logo.png") {
        await fetch("/api/companies/branding/logo", { method: "DELETE" });
      }
      load();
      alert("✓ Semua branding di-reset ke default");
    } catch (e) { alert("✗ " + e.message); }
    finally { setSaving(false); }
  }

  // Per-field clear helper — kasih X button utk reset 1 field ke kosong
  const clearF = (k) => () => setForm(s => ({ ...s, [k]: k === "brand_color" ? "#FF6B35" : k === "currency_code" ? "IDR" : k === "locale" ? "id-ID" : "" }));

  if (!data) return <div style={S.root}>Loading…</div>;

  return (
    <div style={S.root}>
      <header style={S.header}>
        {onBack && <button onClick={onBack} style={S.backBtn}>← Back</button>}
        <h2 style={S.title}>Branding</h2>
      </header>

      <div style={S.intro}>
        🎨 <b style={{ color: "#fff" }}>Per-tenant branding</b> — logo, brand color, dan nama yang muncul di kiosk, POS, receipt, dan modal. Customer lo bakal liat brand lo, bukan karyaos.
      </div>

      {/* LOGO BLOCK */}
      <section style={S.card}>
        <div style={S.cardTitle}>Logo</div>
        <div style={S.logoRow}>
          <div style={S.logoPreviewWrap}>
            <img src={data.logo_url || "/logo.png"} alt="logo"
              style={{ width: 96, height: 96, objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))" }}/>
            <div style={S.logoCaption}>{data.logo_url ? "Custom" : "Default karyaos"}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={S.label}>Upload PNG with transparent background</div>
            <p style={S.hint}>Recommended: 512×512 PNG, transparent bg (so the glow halo follows your logo shape, not a square box).</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                style={S.uploadBtn}>{uploading ? "⏳ Uploading…" : "📤 Upload logo"}</button>
              {data.logo_url && data.logo_url !== "/logo.png" && (
                <button onClick={removeLogo} style={S.removeBtn}>✕ Remove</button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/webp,image/jpeg" style={{ display: "none" }}
              onChange={e => uploadLogo(e.target.files?.[0])}/>
          </div>
        </div>
      </section>

      {/* COLOR + NAME */}
      <section style={S.card}>
        <div style={S.cardTitle}>Brand color &amp; name</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={S.label}>Brand color</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input type="color" value={form.brand_color} onChange={setF("brand_color")}
                style={{ width: 52, height: 40, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "transparent", cursor: "pointer" }}/>
              <input type="text" value={form.brand_color} onChange={setF("brand_color")}
                placeholder="#FF6B35" style={S.input}/>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Hex</span>
            </div>
            <div style={S.hint}>Auto-derives secondary (darker) for gradients. Text color auto-contrast (white on dark / dark on light).</div>
          </div>
          <div>
            <label style={S.label}>Brand name (long)</label>
            <InputWithClear value={form.name} onChange={setF("name")} onClear={clearF("name")}
              placeholder="e.g. Sour Sally · Demo Pitch Cafe" S={S} />
            <div style={S.hint}>Shown on receipt header, full reports.</div>
          </div>
          <div>
            <label style={S.label}>Brand short (optional)</label>
            <InputWithClear value={form.brand_short} onChange={setF("brand_short")} onClear={clearF("brand_short")}
              placeholder="e.g. Sour Sally" S={S} />
            <div style={S.hint}>Compact display name for POS header, WA sender. Defaults to brand name long.</div>
          </div>
        </div>
      </section>

      {/* CURRENCY & LOCALE (P3B) */}
      <section style={S.card}>
        <div style={S.cardTitle}>Currency &amp; locale</div>
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
          <div>
            <label style={S.label}>Currency</label>
            <select value={form.currency_code} onChange={setF("currency_code")} style={{ ...S.input, width: "100%" }}>
              <option value="IDR">IDR · Indonesian Rupiah (Rp)</option>
              <option value="USD">USD · US Dollar ($)</option>
              <option value="SGD">SGD · Singapore Dollar (S$)</option>
              <option value="MYR">MYR · Malaysian Ringgit (RM)</option>
              <option value="THB">THB · Thai Baht (฿)</option>
              <option value="PHP">PHP · Philippine Peso (₱)</option>
              <option value="VND">VND · Vietnamese Dong (₫)</option>
              <option value="EUR">EUR · Euro (€)</option>
              <option value="GBP">GBP · Pound Sterling (£)</option>
            </select>
            <div style={S.hint}>Used for prices on kiosk, POS, receipts.</div>
          </div>
          <div>
            <label style={S.label}>Locale</label>
            <select value={form.locale} onChange={setF("locale")} style={{ ...S.input, width: "100%" }}>
              <option value="id-ID">id-ID (Indonesian)</option>
              <option value="en-US">en-US (English US)</option>
              <option value="en-SG">en-SG (English Singapore)</option>
              <option value="ms-MY">ms-MY (Malay)</option>
              <option value="th-TH">th-TH (Thai)</option>
              <option value="vi-VN">vi-VN (Vietnamese)</option>
              <option value="de-DE">de-DE (German)</option>
              <option value="en-GB">en-GB (English UK)</option>
            </select>
            <div style={S.hint}>Number/date formatting locale.</div>
          </div>
        </div>
      </section>

      {/* CONTACT & ADDRESS */}
      <section style={S.card}>
        <div style={S.cardTitle}>Contact &amp; address</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={S.label}>Contact phone</label>
            <InputWithClear value={form.contact_phone} onChange={setF("contact_phone")} onClear={clearF("contact_phone")}
              placeholder="e.g. +62 812-3456-7890" S={S} />
            <div style={S.hint}>Shown on receipt footer; used in WA template &lbrace;brandPhone&rbrace; variable.</div>
          </div>
          <div>
            <label style={S.label}>Contact email</label>
            <InputWithClear type="email" value={form.contact_email} onChange={setF("contact_email")} onClear={clearF("contact_email")}
              placeholder="hello@yourbrand.com" S={S} />
          </div>
          <div>
            <label style={S.label}>Address</label>
            <TextareaWithClear value={form.address} onChange={setF("address")} onClear={clearF("address")}
              placeholder="Jl. Sudirman Kav 1, Jakarta Pusat 10220" rows={2} S={S} />
          </div>
        </div>
      </section>

      {/* NOTIFICATION FOOTERS */}
      <section style={S.card}>
        <div style={S.cardTitle}>Receipt &amp; notification footers</div>
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <label style={S.label}>Receipt footer</label>
            <TextareaWithClear value={form.receipt_footer} onChange={setF("receipt_footer")} onClear={clearF("receipt_footer")}
              placeholder="Thank you for your order!" rows={2} S={S} />
            <div style={S.hint}>Custom text at the bottom of receipt (after totals). Brand name auto-included.</div>
          </div>
          <div>
            <label style={S.label}>WhatsApp signature</label>
            <TextareaWithClear value={form.wa_signature} onChange={setF("wa_signature")} onClear={clearF("wa_signature")}
              placeholder="— Sour Sally Demo Pitch&#10;📞 +62 812-3456-7890&#10;Jl. Sudirman Kav 1" rows={2} S={S} />
            <div style={S.hint}>Appended to every WA notification. Multi-line OK.</div>
          </div>
          <div>
            <label style={S.label}>Email signature</label>
            <TextareaWithClear value={form.email_signature} onChange={setF("email_signature")} onClear={clearF("email_signature")}
              placeholder="Best regards,&#10;Sour Sally Team&#10;hello@soursally.com" rows={3} S={S} />
            <div style={S.hint}>Appended to outgoing emails (formatted as plain or HTML).</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
            <button onClick={saveBranding} disabled={saving} style={S.saveBtn}>
              {saving ? "Saving…" : "💾 Save all branding"}
            </button>
            <button onClick={resetAllBranding} disabled={saving} style={{ ...S.removeBtn, padding: "12px 18px" }}>
              ⚠️ Reset Semua ke Default
            </button>
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 8, lineHeight: 1.5 }}>
            "Reset" hapus semua kustomisasi (logo, warna, nama, kontak, signature) — fallback ke default karyaos. Konfirmasi sebelum di-eksekusi.
          </div>
        </div>
      </section>

      {/* PREVIEW */}
      <section style={S.card}>
        <div style={S.cardTitle}>Preview</div>
        <div style={S.preview}>
          <img src={data.logo_url || "/logo.png"} alt="logo" style={{ width: 64, height: 64, objectFit: "contain" }}/>
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px" }}>{form.name || "karyaos"}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              Brand color · <span style={{ color: form.brand_color, fontWeight: 600 }}>{form.brand_color}</span>
            </div>
          </div>
          <button style={{ ...S.saveBtn, marginLeft: "auto", background: `linear-gradient(180deg, ${form.brand_color}, ${form.brand_color}cc)` }}>
            Sample CTA
          </button>
        </div>
      </section>
    </div>
  );
}

// Input/textarea dgn tombol ✕ inline utk clear field (UX: tampil cuma kalau ada value)
function InputWithClear({ value, onChange, onClear, placeholder, type = "text", S }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ ...S.input, width: "100%", paddingRight: value ? 36 : 14 }} />
      {value && (
        <button type="button" onClick={onClear} title="Clear" style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          width: 26, height: 26, borderRadius: "50%", padding: 0, cursor: "pointer",
          background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)",
          color: "rgba(248,113,113,0.9)", fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit",
        }}>✕</button>
      )}
    </div>
  );
}
function TextareaWithClear({ value, onChange, onClear, placeholder, rows = 2, S }) {
  return (
    <div style={{ position: "relative" }}>
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
        style={{ ...S.input, width: "100%", resize: "vertical", fontFamily: "'Inter',sans-serif", paddingRight: value ? 36 : 14 }} />
      {value && (
        <button type="button" onClick={onClear} title="Clear" style={{
          position: "absolute", right: 6, top: 6,
          width: 26, height: 26, borderRadius: "50%", padding: 0, cursor: "pointer",
          background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)",
          color: "rgba(248,113,113,0.9)", fontSize: 13, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "inherit",
        }}>✕</button>
      )}
    </div>
  );
}

const S = {
  root: { padding: "20px 24px", maxWidth: 720, margin: "0 auto", color: "#fff", fontFamily: "'Inter',sans-serif" },
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  backBtn: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'Inter',sans-serif" },
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: "-0.5px", color: "rgba(255,255,255,0.95)" },
  intro: { background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: "14px 18px", fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 20 },
  card: {
    background: "linear-gradient(180deg,rgba(255,255,255,0.05) 0%,rgba(255,255,255,0.02) 60%,rgba(255,255,255,0.008) 100%)",
    backdropFilter: "blur(28px) saturate(180%)",
    WebkitBackdropFilter: "blur(28px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.07)",
    borderRadius: 16, padding: 20, marginBottom: 16,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 14px rgba(0,0,0,0.22)",
  },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.95)", marginBottom: 14, letterSpacing: "-0.2px" },
  logoRow: { display: "flex", gap: 20, alignItems: "flex-start" },
  logoPreviewWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 14, background: "rgba(0,0,0,0.18)", border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 14, minWidth: 124 },
  logoCaption: { fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: 0.5, textTransform: "uppercase" },
  label: { display: "block", fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.7)", marginBottom: 6, letterSpacing: "-0.1px" },
  hint: { fontSize: 11, color: "rgba(255,255,255,0.5)", lineHeight: 1.5, marginTop: 6, letterSpacing: "-0.1px" },
  input: { flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", borderRadius: 12, fontSize: 14, fontFamily: "'Inter',sans-serif", outline: "none" },
  uploadBtn: {
    padding: "10px 20px", border: "1px solid rgba(255,255,255,0.16)",
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.45)",
    borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", letterSpacing: "-0.1px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
  removeBtn: { padding: "10px 16px", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", color: "rgba(248,113,113,0.85)", borderRadius: 12, cursor: "pointer", fontSize: 12, fontWeight: 500, fontFamily: "'Inter',sans-serif" },
  saveBtn: {
    padding: "12px 24px", border: "1px solid rgba(255,255,255,0.16)",
    background: "radial-gradient(ellipse 90% 180% at 50% 100%, color-mix(in srgb, var(--brand-primary,#FF6B35) 60%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--brand-primary,#FF6B35) 38%, #1a1d29), color-mix(in srgb, var(--brand-secondary,#E55A2B) 30%, #0d0f14))",
    color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.45)",
    borderRadius: 14, cursor: "pointer", fontSize: 14, fontWeight: 600,
    fontFamily: "'Inter',sans-serif", letterSpacing: "-0.2px",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 24px color-mix(in srgb, var(--brand-primary,#FF6B35) 22%, transparent)",
  },
  preview: { display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14 },
};
