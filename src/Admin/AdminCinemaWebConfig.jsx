// AdminCinemaWebConfig — Phase 1: edit nav header + footer per company
// Untuk cinema web (kiosk.karys.tech/?movies=1)

import { useState, useEffect } from "react";
import API_HOST from "../apiBase.js";

const DEFAULT_NAV = [
  { key: "outlet",    label: "Beranda",   target: "outlet",    visible: true, order: 1 },
  { key: "movies",    label: "Movies",    target: "movies",    visible: true, order: 2 },
  { key: "promo",     label: "Promo",     target: "promo",     visible: true, order: 3 },
  { key: "studio",    label: "Studio",    target: "studio",    visible: true, order: 4 },
  { key: "locations", label: "Lokasi",    target: "locations", visible: true, order: 5 },
  { key: "about",     label: "About",     target: "about",     visible: true, order: 6 },
];

const DEFAULT_FOOTER = {
  description: "Pengalaman cinema premium di ujung jari Anda. Pesan tiket online, pilih kursi, langsung nonton.",
  social: [
    { name: "WA", icon: "💬", url: "https://wa.me/6285190062368" },
    { name: "IG", icon: "📷", url: "https://instagram.com" },
    { name: "TT", icon: "🎵", url: "https://tiktok.com" },
    { name: "YT", icon: "▶", url: "https://youtube.com" },
  ],
  nav: [
    { label: "Beranda", target: "outlet" },
    { label: "Movies", target: "movies" },
    { label: "Promo & Event", target: "promo" },
    { label: "Booking Studio", target: "studio" },
    { label: "Lokasi", target: "locations" },
  ],
  help: [
    { label: "FAQ", target: "faq" },
    { label: "Cara Pesan Tiket", target: "faq" },
    { label: "Kebijakan Refund", target: "faq" },
    { label: "Loyalty Program", target: "faq" },
    { label: "Customer Service", url: "https://wa.me/6285190062368" },
  ],
  company: [
    { label: "Tentang Kami", target: "about" },
    { label: "Karier", target: "about" },
    { label: "Partnership", target: "about" },
  ],
  legal: [
    { label: "Syarat & Ketentuan", target: "faq" },
    { label: "Kebijakan Privasi", target: "faq" },
  ],
};

const NAV_TARGETS = ["outlet", "movies", "promo", "studio", "locations", "about", "faq", "history"];

// Default FAQ (synced dgn frontend FAQ_GROUPS — kalau frontend update, sync di sini)
const DEFAULT_FAQ = [
  {
    title: "🎟️ Pemesanan Tiket",
    items: [
      { q: "Bagaimana cara pesan tiket?", a: "Lima langkah, lima menit: pilih lokasi → pilih film → pilih jadwal → pilih kursi → checkout. Tiket otomatis dikirim ke WhatsApp Anda dalam bentuk QR. Tinggal tunjukin di counter, beres." },
      { q: "Bayarnya di mana?", a: "Dua pilihan: bayar online lewat Midtrans (QRIS, e-wallet, transfer bank, kartu) atau bayar tunai/QRIS di counter saat ambil tiket." },
      { q: "Bisa pilih kursi sendiri?", a: "Tentu. Peta kursi real-time — kursi yang sudah dibeli orang lain langsung terblok, jadi tidak ada cerita kursi kembar atau double-booking." },
    ],
  },
  {
    title: "💳 Pembayaran & Refund",
    items: [
      { q: "Metode pembayaran apa saja?", a: "Hampir semua: QRIS, kartu kredit/debit, e-wallet (GoPay, OVO, Dana, ShopeePay), Virtual Account, bahkan bayar tunai di Alfamart/Indomaret." },
      { q: "Bisa refund tiket?", a: "Tiket tidak bisa di-refund dalam bentuk uang, tapi bisa reschedule ke jadwal lain di hari yang sama." },
    ],
  },
];

export default function AdminCinemaWebConfig({ onBack }) {
  const [navItems, setNavItems] = useState(DEFAULT_NAV);
  const [footer, setFooter] = useState(DEFAULT_FOOTER);
  const [faqGroups, setFaqGroups] = useState(DEFAULT_FAQ);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("nav");  // "nav" | "footer" | "faq"
  const [openGroupIdx, setOpenGroupIdx] = useState(0);  // FAQ: which group expanded

  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/web-config`)
      .then(r => r.json())
      .then(d => {
        if (d.config?.nav_items?.length) setNavItems(d.config.nav_items);
        if (d.config?.footer_config) setFooter({ ...DEFAULT_FOOTER, ...d.config.footer_config });
        if (d.config?.faq_groups?.length) setFaqGroups(d.config.faq_groups);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`${API_HOST}/api/cinema/web-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nav_items: navItems.map((n, i) => ({ ...n, order: i + 1 })),
          footer_config: footer,
          faq_groups: faqGroups,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setMsg("✅ Tersimpan");
      setTimeout(() => setMsg(""), 2500);
    } catch (e) {
      setMsg(`⚠️ ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const resetDefault = () => {
    if (!confirm("Reset semua ke default? Perubahan custom akan hilang.")) return;
    setNavItems(DEFAULT_NAV);
    setFooter(DEFAULT_FOOTER);
    setFaqGroups(DEFAULT_FAQ);
  };

  // ───────── FAQ editing ─────────
  const updateGroup = (gi, patch) => {
    setFaqGroups(gs => gs.map((g, i) => i === gi ? { ...g, ...patch } : g));
  };
  const updateItem = (gi, ii, patch) => {
    setFaqGroups(gs => gs.map((g, i) => i === gi
      ? { ...g, items: g.items.map((it, j) => j === ii ? { ...it, ...patch } : it) }
      : g));
  };
  const addGroup = () => {
    setFaqGroups(gs => [...gs, { title: "📌 Grup Baru", items: [{ q: "", a: "" }] }]);
    setOpenGroupIdx(faqGroups.length);
  };
  const removeGroup = (gi) => {
    if (!confirm(`Hapus grup "${faqGroups[gi].title}" beserta semua Q&A?`)) return;
    setFaqGroups(gs => gs.filter((_, i) => i !== gi));
  };
  const moveGroup = (gi, dir) => {
    setFaqGroups(gs => {
      const arr = [...gs];
      const t = gi + dir;
      if (t < 0 || t >= arr.length) return gs;
      [arr[gi], arr[t]] = [arr[t], arr[gi]];
      return arr;
    });
  };
  const addItem = (gi) => {
    setFaqGroups(gs => gs.map((g, i) => i === gi ? { ...g, items: [...g.items, { q: "", a: "" }] } : g));
  };
  const removeItem = (gi, ii) => {
    setFaqGroups(gs => gs.map((g, i) => i === gi ? { ...g, items: g.items.filter((_, j) => j !== ii) } : g));
  };
  const moveItem = (gi, ii, dir) => {
    setFaqGroups(gs => gs.map((g, i) => {
      if (i !== gi) return g;
      const arr = [...g.items];
      const t = ii + dir;
      if (t < 0 || t >= arr.length) return g;
      [arr[ii], arr[t]] = [arr[t], arr[ii]];
      return { ...g, items: arr };
    }));
  };

  // ───────── Nav editing ─────────
  const updateNav = (idx, patch) => {
    setNavItems(items => items.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const moveNav = (idx, dir) => {
    setNavItems(items => {
      const newItems = [...items];
      const target = idx + dir;
      if (target < 0 || target >= newItems.length) return items;
      [newItems[idx], newItems[target]] = [newItems[target], newItems[idx]];
      return newItems;
    });
  };
  const addNav = () => {
    const newKey = `custom-${Date.now()}`;
    setNavItems(items => [...items, { key: newKey, label: "Item Baru", target: "outlet", visible: true }]);
  };
  const removeNav = (idx) => {
    setNavItems(items => items.filter((_, i) => i !== idx));
  };

  // ───────── Footer link editing ─────────
  const updateFooterCol = (col, idx, patch) => {
    setFooter(f => ({
      ...f,
      [col]: f[col].map((it, i) => i === idx ? { ...it, ...patch } : it),
    }));
  };
  const addFooterLink = (col) => {
    setFooter(f => ({ ...f, [col]: [...f[col], { label: "Link Baru", target: "outlet" }] }));
  };
  const removeFooterLink = (col, idx) => {
    setFooter(f => ({ ...f, [col]: f[col].filter((_, i) => i !== idx) }));
  };
  const moveFooterLink = (col, idx, dir) => {
    setFooter(f => {
      const arr = [...f[col]];
      const t = idx + dir;
      if (t < 0 || t >= arr.length) return f;
      [arr[idx], arr[t]] = [arr[t], arr[idx]];
      return { ...f, [col]: arr };
    });
  };

  if (loading) {
    return <div style={{ padding: 40, color: "#9ca3af" }}>Memuat config…</div>;
  }

  return (
    <div style={{ padding: "20px 24px", color: "#e5e7eb", maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <button onClick={onBack} style={btnStyle("ghost")}>← Kembali</button>
          <h1 style={{ display: "inline-block", marginLeft: 16, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>
            🌐 Cinema Web — Nav & Footer
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={resetDefault} style={btnStyle("ghost")}>↺ Reset Default</button>
          <button onClick={save} disabled={saving} style={btnStyle("primary", saving)}>{saving ? "Menyimpan…" : "💾 Simpan"}</button>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
        Atur nav header & footer di cinema booking web (<code style={{ color: "#fb923c" }}>kiosk.karys.tech/?movies=1</code>).
        Perubahan langsung kepakai setelah disimpan (user perlu hard refresh).
      </p>

      {msg && (
        <div style={{ padding: "10px 14px", background: msg.startsWith("⚠️") ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.1)", border: `1px solid ${msg.startsWith("⚠️") ? "rgba(239,68,68,0.4)" : "rgba(16,185,129,0.4)"}`, borderRadius: 8, marginBottom: 16, fontSize: 13, color: msg.startsWith("⚠️") ? "#fca5a5" : "#10b981" }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        {[{ k: "nav", l: "🧭 Nav Header" }, { k: "footer", l: "📄 Footer" }, { k: "faq", l: "❓ FAQ" }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            padding: "10px 18px", background: "transparent", border: "none",
            color: tab === t.k ? "#fb923c" : "#9ca3af",
            borderBottom: `2px solid ${tab === t.k ? "#fb923c" : "transparent"}`,
            fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            marginBottom: -1,
          }}>{t.l}</button>
        ))}
      </div>

      {tab === "nav" && (
        <div>
          <div style={{ marginBottom: 12, fontSize: 12, color: "#9ca3af" }}>
            Drag-reorder belum, pakai panah ↑↓. Toggle <strong>visible</strong> utk show/hide item tanpa hapus.
          </div>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
            {/* Header row */}
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 80px 100px", padding: "10px 14px", background: "rgba(255,255,255,0.04)", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
              <div>#</div>
              <div>Label</div>
              <div>Target</div>
              <div style={{ textAlign: "center" }}>Visible</div>
              <div style={{ textAlign: "right" }}>Action</div>
            </div>
            {navItems.map((item, idx) => (
              <div key={`${item.key}-${idx}`} style={{ display: "grid", gridTemplateColumns: "40px 1fr 1fr 80px 100px", padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button onClick={() => moveNav(idx, -1)} disabled={idx === 0} style={miniBtn(idx === 0)}>↑</button>
                  <button onClick={() => moveNav(idx, +1)} disabled={idx === navItems.length - 1} style={miniBtn(idx === navItems.length - 1)}>↓</button>
                </div>
                <input value={item.label} onChange={e => updateNav(idx, { label: e.target.value })} style={inputStyle} />
                <select value={item.target || item.key} onChange={e => updateNav(idx, { target: e.target.value })} style={inputStyle}>
                  {NAV_TARGETS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ textAlign: "center" }}>
                  <input type="checkbox" checked={item.visible !== false} onChange={e => updateNav(idx, { visible: e.target.checked })} style={{ cursor: "pointer", width: 18, height: 18 }} />
                </div>
                <div style={{ textAlign: "right" }}>
                  <button onClick={() => removeNav(idx)} style={btnStyle("danger-mini")}>Hapus</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={addNav} style={{ marginTop: 12, ...btnStyle("ghost") }}>+ Tambah Item</button>
        </div>
      )}

      {tab === "footer" && (
        <div>
          {/* Brand description */}
          <FormSection title="📝 Brand Description">
            <textarea value={footer.description} onChange={e => setFooter(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inputStyle, width: "100%", minHeight: 80, resize: "vertical" }} />
          </FormSection>

          {/* Social */}
          <FormSection title="🌐 Social Media URLs">
            {footer.social.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 60px 1fr 90px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input value={s.name} onChange={e => updateFooterCol("social", i, { name: e.target.value })} placeholder="WA" style={inputStyle} />
                <input value={s.icon} onChange={e => updateFooterCol("social", i, { icon: e.target.value })} placeholder="💬" style={inputStyle} />
                <input value={s.url} onChange={e => updateFooterCol("social", i, { url: e.target.value })} placeholder="https://wa.me/..." style={inputStyle} />
                <button onClick={() => removeFooterLink("social", i)} style={btnStyle("danger-mini")}>Hapus</button>
              </div>
            ))}
            <button onClick={() => setFooter(f => ({ ...f, social: [...f.social, { name: "", icon: "🔗", url: "" }] }))} style={btnStyle("ghost")}>+ Tambah</button>
          </FormSection>

          {/* Columns */}
          {[
            { key: "nav",     title: "Kolom 2: Navigasi" },
            { key: "help",    title: "Kolom 3: Bantuan" },
            { key: "company", title: "Kolom 4: Perusahaan" },
            { key: "legal",   title: "Kolom 4 (bawah): Legal" },
          ].map(col => (
            <FormSection key={col.key} title={col.title}>
              {footer[col.key]?.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 100px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={() => moveFooterLink(col.key, i, -1)} disabled={i === 0} style={miniBtn(i === 0)}>↑</button>
                    <button onClick={() => moveFooterLink(col.key, i, +1)} disabled={i === footer[col.key].length - 1} style={miniBtn(i === footer[col.key].length - 1)}>↓</button>
                  </div>
                  <input value={l.label} onChange={e => updateFooterCol(col.key, i, { label: e.target.value })} placeholder="Label" style={inputStyle} />
                  <input value={l.url || l.target || ""} onChange={e => {
                    const v = e.target.value;
                    // Auto-detect: kalau http(s) → url. Selain itu target.
                    if (v.startsWith("http")) updateFooterCol(col.key, i, { url: v, target: undefined });
                    else updateFooterCol(col.key, i, { target: v, url: undefined });
                  }} placeholder="outlet / movies / faq / https://..." style={inputStyle} />
                  <button onClick={() => removeFooterLink(col.key, i)} style={btnStyle("danger-mini")}>Hapus</button>
                </div>
              ))}
              <button onClick={() => addFooterLink(col.key)} style={btnStyle("ghost")}>+ Tambah Link</button>
            </FormSection>
          ))}
        </div>
      )}

      {tab === "faq" && (
        <div>
          <div style={{ marginBottom: 12, fontSize: 12, color: "#9ca3af" }}>
            Klik grup utk expand/collapse Q&A. Reorder dgn ↑↓. Edit langsung di input.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {faqGroups.map((g, gi) => {
              const open = openGroupIdx === gi;
              return (
                <div key={gi} style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
                  {/* Group header — clickable accordion */}
                  <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", gap: 10, background: open ? "rgba(251,146,60,0.06)" : "transparent", borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <button onClick={() => moveGroup(gi, -1)} disabled={gi === 0} style={miniBtn(gi === 0)}>↑</button>
                      <button onClick={() => moveGroup(gi, +1)} disabled={gi === faqGroups.length - 1} style={miniBtn(gi === faqGroups.length - 1)}>↓</button>
                    </div>
                    <input value={g.title} onChange={e => updateGroup(gi, { title: e.target.value })} placeholder="🎟️ Nama Grup" style={{ ...inputStyle, flex: 1, fontSize: 14, fontWeight: 700 }} />
                    <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{g.items.length} Q&A</span>
                    <button onClick={() => setOpenGroupIdx(open ? -1 : gi)} style={btnStyle("ghost")}>{open ? "▲" : "▼"}</button>
                    <button onClick={() => removeGroup(gi)} style={btnStyle("danger-mini")}>🗑</button>
                  </div>

                  {/* Group items — only if expanded */}
                  {open && (
                    <div style={{ padding: "12px 14px" }}>
                      {g.items.length === 0 && (
                        <div style={{ padding: 16, color: "#9ca3af", fontSize: 12, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 6, marginBottom: 10 }}>
                          Belum ada Q&A. Klik tombol di bawah utk tambah.
                        </div>
                      )}
                      {g.items.map((item, ii) => (
                        <div key={ii} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                            <button onClick={() => moveItem(gi, ii, -1)} disabled={ii === 0} style={miniBtn(ii === 0)}>↑</button>
                            <button onClick={() => moveItem(gi, ii, +1)} disabled={ii === g.items.length - 1} style={miniBtn(ii === g.items.length - 1)}>↓</button>
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                            <input value={item.q} onChange={e => updateItem(gi, ii, { q: e.target.value })} placeholder="Pertanyaan…" style={{ ...inputStyle, fontWeight: 700 }} />
                            <textarea value={item.a} onChange={e => updateItem(gi, ii, { a: e.target.value })} placeholder="Jawaban…" rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 64, fontFamily: "inherit", lineHeight: 1.5 }} />
                          </div>
                          <button onClick={() => removeItem(gi, ii)} style={btnStyle("danger-mini")}>🗑</button>
                        </div>
                      ))}
                      <button onClick={() => addItem(gi)} style={btnStyle("ghost")}>+ Tambah Q&A</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={addGroup} style={{ marginTop: 14, ...btnStyle("ghost") }}>+ Tambah Grup Baru</button>
        </div>
      )}

      {/* Floating save button */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 30, padding: "14px 0", background: "linear-gradient(to top, #0a0e16 60%, transparent)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={save} disabled={saving} style={btnStyle("primary", saving)}>{saving ? "Menyimpan…" : "💾 Simpan Perubahan"}</button>
      </div>
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: 24, background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#fff", margin: 0, marginBottom: 12, letterSpacing: -0.2 }}>{title}</h3>
      {children}
    </div>
  );
}

const inputStyle = {
  padding: "8px 10px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
};

function btnStyle(variant, disabled) {
  const base = {
    padding: "8px 16px", borderRadius: 8, border: "none",
    fontSize: 13, fontWeight: 700, fontFamily: "inherit",
    cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.6 : 1,
    transition: "all 0.15s",
  };
  if (variant === "primary") return { ...base, background: "#fb923c", color: "#fff" };
  if (variant === "ghost") return { ...base, background: "transparent", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.12)" };
  if (variant === "danger-mini") return { ...base, padding: "5px 10px", fontSize: 11, background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" };
  return base;
}

function miniBtn(disabled) {
  return {
    width: 24, height: 14, padding: 0, fontSize: 10,
    background: disabled ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)",
    color: disabled ? "rgba(255,255,255,0.3)" : "#fff",
    border: "none", borderRadius: 3,
    cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit",
  };
}
