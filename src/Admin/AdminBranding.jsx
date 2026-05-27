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
    // P5 — Theme Studio
    font_family: "", bg_config: null,
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
          font_family: b?.font_family || "",
          bg_config: b?.bg_config || null,
        });
      });
  }, []);
  useEffect(load, [load]);

  async function uploadLogo(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("logo", file);
    if (data?.company_id) fd.append("company_id", String(data.company_id));
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
      const url = data?.company_id ? `/api/companies/branding/logo?company_id=${data.company_id}` : "/api/companies/branding/logo";
      await fetch(url, { method: "DELETE" });
      load();
    } catch (e) { alert("✗ " + e.message); }
  }

  async function saveBranding() {
    setSaving(true);
    try {
      // Pass company_id explicit dari GET response — jaga2 kalau scope hilang/super-admin
      const body = data?.company_id ? { ...form, company_id: data.company_id } : form;
      const r = await fetch("/api/companies/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
        <div style={{ flex: 1 }} />
        <button onClick={saveBranding} disabled={saving} style={{ ...S.saveBtn, padding: "8px 18px", fontSize: 13 }}>
          {saving ? "Saving…" : "💾 Save"}
        </button>
      </header>

      <div style={S.intro}>
        🎨 <b style={{ color: "#fff" }}>Per-tenant branding</b> — logo, brand color, dan nama yang muncul di kiosk, POS, receipt, dan modal. Customer lo bakal liat brand lo, bukan karyaos.
        <div style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          💡 Edit field di bawah → klik <b style={{ color: "#fb923c" }}>💾 Save</b> di header atau footer bawah utk simpan.
        </div>
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

      {/* P5 — THEME STUDIO (font + background) */}
      <section style={S.card}>
        <div style={S.cardTitle}>🎨 Theme — Font &amp; Background</div>
        <div style={{ display: "grid", gap: 16 }}>
          {/* FONT PICKER */}
          <div>
            <label style={S.label}>Font Family</label>
            <select value={form.font_family || ""} onChange={setF("font_family")} style={{ ...S.input, width: "100%", fontFamily: form.font_family ? `'${form.font_family}',sans-serif` : "inherit" }}>
              <option value="">Inter (default — modern UI)</option>
              <option value="Poppins" style={{ fontFamily: "'Poppins',sans-serif" }}>Poppins — rounded modern</option>
              <option value="Roboto" style={{ fontFamily: "'Roboto',sans-serif" }}>Roboto — Material standard</option>
              <option value="Montserrat" style={{ fontFamily: "'Montserrat',sans-serif" }}>Montserrat — geometric clean</option>
              <option value="Playfair Display" style={{ fontFamily: "'Playfair Display',serif" }}>Playfair Display — elegant serif</option>
              <option value="Cormorant Garamond" style={{ fontFamily: "'Cormorant Garamond',serif" }}>Cormorant — classy serif</option>
              <option value="Bebas Neue" style={{ fontFamily: "'Bebas Neue',sans-serif" }}>Bebas Neue — impactful poster</option>
              <option value="Oswald" style={{ fontFamily: "'Oswald',sans-serif" }}>Oswald — condensed bold</option>
              <option value="Manrope" style={{ fontFamily: "'Manrope',sans-serif" }}>Manrope — modern sans</option>
              <option value="DM Serif Display" style={{ fontFamily: "'DM Serif Display',serif" }}>DM Serif Display — high contrast</option>
            </select>
            <div style={S.hint}>Font dipakai di cinema web (booking page). Kosong = default Inter. Google Fonts auto-loaded.</div>
            {/* Live preview */}
            {form.font_family && (
              <div style={{ marginTop: 10, padding: 14, background: "rgba(0,0,0,0.3)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontFamily: `'${form.font_family}',sans-serif`, fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{form.name || "Brand Name"}</div>
                <div style={{ fontFamily: `'${form.font_family}',sans-serif`, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>The quick brown fox jumps over the lazy dog 0123456789</div>
              </div>
            )}
            {/* Preload font CSS */}
            {form.font_family && (
              <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(form.font_family)}:wght@300;400;600;700;800;900&display=swap`} />
            )}
          </div>

          {/* BACKGROUND PICKER */}
          <div>
            <label style={S.label}>Background</label>
            <BgPicker
              value={form.bg_config}
              onChange={(v) => setForm(s => ({ ...s, bg_config: v }))}
              brandColor={form.brand_color}
              S={S}
            />
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

      {/* STICKY SAVE BAR — selalu visible saat scroll */}
      <div style={{
        position: "sticky", bottom: 0, marginTop: 24,
        padding: "14px 20px", marginLeft: -24, marginRight: -24,
        background: "linear-gradient(to top, rgba(10,12,20,0.98) 60%, rgba(10,12,20,0.85))",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center",
      }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginRight: "auto" }}>
          {saving ? "⏳ Menyimpan…" : "💡 Klik Save untuk apply perubahan"}
        </span>
        <button onClick={resetAllBranding} disabled={saving} style={S.removeBtn}>
          ⚠️ Reset Default
        </button>
        <button onClick={saveBranding} disabled={saving} style={S.saveBtn}>
          {saving ? "Saving…" : "💾 Save All Branding"}
        </button>
      </div>
    </div>
  );
}

// Background picker — 4 mode: color, image (URL), gradient, pattern
function BgPicker({ value, onChange, brandColor, S }) {
  const mode = value?.mode || "default";
  const setMode = (m) => {
    if (m === "default") onChange(null);
    else if (m === "color") onChange({ mode: "color", value: value?.value || "#141414" });
    else if (m === "gradient") onChange({ mode: "gradient", value: value?.value || "#141414", value2: value?.value2 || (brandColor || "#fb923c"), direction: value?.direction || "135deg" });
    else if (m === "image") onChange({ mode: "image", value: value?.value || "" });
    else if (m === "pattern") onChange({ mode: "pattern", value: value?.value || "dots" });
  };
  return (
    <div>
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          { k: "default",  l: "🎨 Default (Netflix #141414)" },
          { k: "color",    l: "🎯 Solid Color" },
          { k: "gradient", l: "🌈 Gradient" },
          { k: "image",    l: "🖼 Image URL" },
          { k: "pattern",  l: "✨ Pattern" },
        ].map(o => (
          <button key={o.k} onClick={(e) => { e.preventDefault(); setMode(o.k); }} style={{
            padding: "6px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6,
            background: mode === o.k ? "#fb923c" : "rgba(255,255,255,0.04)",
            color: mode === o.k ? "#fff" : "#e5e7eb",
            border: `1px solid ${mode === o.k ? "#fb923c" : "rgba(255,255,255,0.08)"}`,
            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          }}>{o.l}</button>
        ))}
      </div>

      {/* Mode-specific input */}
      {mode === "default" && (
        <div style={{ padding: 14, background: "rgba(0,0,0,0.3)", borderRadius: 10, color: "rgba(255,255,255,0.6)", fontSize: 12 }}>
          Pakai default platform — solid <code style={{ color: "#fb923c" }}>#141414</code> (Netflix style).
        </div>
      )}

      {mode === "color" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="color" value={value?.value || "#141414"}
            onChange={e => onChange({ ...value, mode: "color", value: e.target.value })}
            style={{ width: 52, height: 40, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, cursor: "pointer", background: "transparent" }} />
          <input type="text" value={value?.value || "#141414"}
            onChange={e => onChange({ ...value, mode: "color", value: e.target.value })}
            placeholder="#141414" style={{ ...S.input, flex: 1 }} />
        </div>
      )}

      {mode === "gradient" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 80 }}>Color 1:</span>
            <input type="color" value={value?.value || "#141414"} onChange={e => onChange({ ...value, mode: "gradient", value: e.target.value })} style={{ width: 40, height: 32, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer", background: "transparent" }} />
            <input type="text" value={value?.value || "#141414"} onChange={e => onChange({ ...value, mode: "gradient", value: e.target.value })} placeholder="#141414" style={{ ...S.input, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 80 }}>Color 2:</span>
            <input type="color" value={value?.value2 || "#1a1a24"} onChange={e => onChange({ ...value, mode: "gradient", value2: e.target.value })} style={{ width: 40, height: 32, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, cursor: "pointer", background: "transparent" }} />
            <input type="text" value={value?.value2 || "#1a1a24"} onChange={e => onChange({ ...value, mode: "gradient", value2: e.target.value })} placeholder="#1a1a24" style={{ ...S.input, flex: 1 }} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 80 }}>Direction:</span>
            <select value={value?.direction || "135deg"} onChange={e => onChange({ ...value, mode: "gradient", direction: e.target.value })} style={{ ...S.input, flex: 1 }}>
              <option value="0deg">↑ Top</option>
              <option value="45deg">↗ Top-Right</option>
              <option value="90deg">→ Right</option>
              <option value="135deg">↘ Bottom-Right (default)</option>
              <option value="180deg">↓ Bottom</option>
              <option value="225deg">↙ Bottom-Left</option>
              <option value="270deg">← Left</option>
              <option value="315deg">↖ Top-Left</option>
            </select>
          </div>
        </div>
      )}

      {mode === "image" && (
        <div>
          <input type="text" value={value?.value || ""} onChange={e => onChange({ ...value, mode: "image", value: e.target.value })}
            placeholder="https://images.unsplash.com/photo-... (full URL)" style={{ ...S.input, width: "100%" }} />
          <div style={S.hint}>Paste URL gambar (HTTPS). Tip: pakai Unsplash CDN atau upload ke server lain.</div>
        </div>
      )}

      {mode === "pattern" && (
        <div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { k: "dots",  l: "● Dots" },
              { k: "grid",  l: "▦ Grid" },
              { k: "noise", l: "▒ Noise" },
            ].map(p => (
              <button key={p.k} onClick={(e) => { e.preventDefault(); onChange({ ...value, mode: "pattern", value: p.k }); }} style={{
                padding: "8px 14px", fontSize: 12, fontWeight: 700, borderRadius: 8,
                background: value?.value === p.k ? "#fb923c" : "rgba(255,255,255,0.04)",
                color: value?.value === p.k ? "#fff" : "#e5e7eb",
                border: `1px solid ${value?.value === p.k ? "#fb923c" : "rgba(255,255,255,0.08)"}`,
                cursor: "pointer", fontFamily: "inherit",
              }}>{p.l}</button>
            ))}
          </div>
        </div>
      )}

      {/* Live preview */}
      <div style={{
        marginTop: 12, height: 80, borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)",
        background: bgConfigToCss(value),
        backgroundSize: value?.mode === "pattern" ? "20px 20px" : "cover",
        backgroundPosition: "center",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.6)", fontSize: 11, fontFamily: "'JetBrains Mono',monospace",
      }}>
        — Live Preview —
      </div>
    </div>
  );
}

// Helper: konversi bg_config object → CSS background value
function bgConfigToCss(cfg) {
  if (!cfg || cfg.mode === "default") return "#141414";
  if (cfg.mode === "color")    return cfg.value || "#141414";
  if (cfg.mode === "gradient") return `linear-gradient(${cfg.direction || "135deg"}, ${cfg.value || "#141414"}, ${cfg.value2 || "#1a1a24"})`;
  if (cfg.mode === "image" && cfg.value) return `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url('${cfg.value}') center/cover, #141414`;
  if (cfg.mode === "pattern") {
    if (cfg.value === "dots")  return `radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), #141414`;
    if (cfg.value === "grid")  return `linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px), #141414`;
    if (cfg.value === "noise") return `repeating-linear-gradient(0deg, rgba(255,255,255,0.02) 0px, transparent 1px, transparent 3px), #141414`;
  }
  return "#141414";
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
