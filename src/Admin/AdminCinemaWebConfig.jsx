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

// Section toggles — semua default ON
const DEFAULT_SECTION_TOGGLES = {
  my_list:      true,
  now_showing:  true,
  top10:        true,
  top_picks:    true,
  coming_soon:  true,
  by_genre:     true,
  genre_filter: true,
};
const SECTION_META = [
  { key: "my_list",      label: "📑 My List",            desc: "Row film yg di-bookmark customer (visible kalau user signed-in)" },
  { key: "now_showing",  label: "🎬 Sedang Tayang",     desc: "Row film yang sedang tayang" },
  { key: "top10",        label: "🔥 Top 10",             desc: "Row Top 10 dgn numeral besar (booking count)" },
  { key: "top_picks",    label: "⭐ Top Picks Member",   desc: "Row film rating tinggi (avg ≥4)" },
  { key: "coming_soon",  label: "🔜 Segera Tayang",     desc: "Row film coming soon (status coming_soon)" },
  { key: "by_genre",     label: "🎭 Group by Genre",    desc: "Auto-row per genre (Action, Drama, dll)" },
  { key: "genre_filter", label: "🏷️ Genre Filter Chips", desc: "Chip bar filter genre di atas semua row" },
];

// Page heros — empty = pakai default hardcode
const DEFAULT_PAGE_HEROS = {
  promo:     { tag: "", title: "", subtitle: "", accent: "" },
  studio:    { tag: "", title: "", subtitle: "", accent: "" },
  locations: { tag: "", title: "", subtitle: "", accent: "" },
  about:     { tag: "", title: "", subtitle: "", accent: "" },
  faq:       { tag: "", title: "", subtitle: "", accent: "" },
};
const PAGE_HERO_META = [
  { key: "promo",     label: "🎟 Promo Page",     placeholder: { tag: "Promo & Event", title: "Nonton Lebih Hemat", subtitle: "...promo aktif menunggu Anda...", accent: "🎟" } },
  { key: "studio",    label: "🎉 Studio Page",    placeholder: { tag: "Studio Booking", title: "Sewa Bioskop Sendiri", subtitle: "Ulang tahun, anniversary, gathering...", accent: "🎉" } },
  { key: "locations", label: "📍 Locations Page", placeholder: { tag: "Lokasi", title: "Cari Cinema Terdekat", subtitle: "...outlet KaryaOS siap menyambut...", accent: "📍" } },
  { key: "about",     label: "🎬 About Page",     placeholder: { tag: "About Us", title: "KaryaOS", subtitle: "Bioskop tanpa antri loket...", accent: "🎬" } },
  { key: "faq",       label: "❓ FAQ Page",       placeholder: { tag: "FAQ · Bantuan", title: "Tanya Apa Saja", subtitle: "Dari klasifikasi usia film...", accent: "❓" } },
];

export default function AdminCinemaWebConfig({ onBack }) {
  const [navItems, setNavItems] = useState(DEFAULT_NAV);
  const [footer, setFooter] = useState(DEFAULT_FOOTER);
  const [faqGroups, setFaqGroups] = useState(DEFAULT_FAQ);
  const [sectionToggles, setSectionToggles] = useState(DEFAULT_SECTION_TOGGLES);
  const [pageHeros, setPageHeros] = useState(DEFAULT_PAGE_HEROS);
  const [customSections, setCustomSections] = useState([]);
  const [customPages, setCustomPages] = useState([]);
  const [films, setFilms] = useState([]);  // utk film picker di custom section
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("nav");
  const [openGroupIdx, setOpenGroupIdx] = useState(0);
  const [openHeroKey, setOpenHeroKey] = useState("promo");
  const [editingSectionIdx, setEditingSectionIdx] = useState(-1);
  const [editingPageIdx, setEditingPageIdx] = useState(-1);

  useEffect(() => {
    fetch(`${API_HOST}/api/cinema/web-config`)
      .then(r => r.json())
      .then(d => {
        if (d.config?.nav_items?.length) setNavItems(d.config.nav_items);
        if (d.config?.footer_config) setFooter({ ...DEFAULT_FOOTER, ...d.config.footer_config });
        if (d.config?.faq_groups?.length) setFaqGroups(d.config.faq_groups);
        if (d.config?.section_toggles) setSectionToggles({ ...DEFAULT_SECTION_TOGGLES, ...d.config.section_toggles });
        if (d.config?.page_heros) setPageHeros({ ...DEFAULT_PAGE_HEROS, ...d.config.page_heros });
        if (Array.isArray(d.config?.custom_sections)) setCustomSections(d.config.custom_sections);
        if (Array.isArray(d.config?.custom_pages)) setCustomPages(d.config.custom_pages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Load film list utk picker
    fetch(`${API_HOST}/api/cinema/films`).then(r => r.json()).then(d => setFilms(d.films || [])).catch(() => {});
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
          section_toggles: sectionToggles,
          page_heros: pageHeros,
          custom_sections: customSections.map((s, i) => ({ ...s, order: i + 1 })),
          custom_pages: customPages,
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
    setSectionToggles(DEFAULT_SECTION_TOGGLES);
    setPageHeros(DEFAULT_PAGE_HEROS);
    setCustomSections([]);
    setCustomPages([]);
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
        {[
          { k: "nav",      l: "🧭 Nav Header" },
          { k: "footer",   l: "📄 Footer" },
          { k: "faq",      l: "❓ FAQ" },
          { k: "sections", l: "🎚️ Sections" },
          { k: "heros",    l: "🎨 Page Heros" },
        ].map(t => (
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

      {tab === "sections" && (
        <div>
          <div style={{ marginBottom: 16, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
            Toggle show/hide section di <strong style={{ color: "#fff" }}>halaman Movies</strong> cinema web.
            Section yg di-disable tidak akan dirender — tidak terlihat oleh customer.
          </div>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
            {SECTION_META.map((s, i) => {
              const enabled = sectionToggles[s.key] !== false;
              return (
                <label key={s.key} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  cursor: "pointer", transition: "background 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {/* Toggle switch */}
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => setSectionToggles(t => ({ ...t, [s.key]: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: enabled ? "#fff" : "#6b7280" }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>{s.desc}</div>
                  </div>
                  <span style={{
                    padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 800,
                    background: enabled ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)",
                    color: enabled ? "#10b981" : "#fca5a5",
                    border: `1px solid ${enabled ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
                    fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
                  }}>{enabled ? "ON" : "OFF"}</span>
                </label>
              );
            })}
          </div>

          {/* CUSTOM SECTIONS — admin bikin row film manual */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>➕ Custom Sections (Row Film Manual)</h3>
              <button onClick={() => {
                const id = Date.now();
                setCustomSections(s => [...s, { id, title: "🎯 Section Baru", film_ids: [], visible: true }]);
                setEditingSectionIdx(customSections.length);
              }} style={btnStyle("primary")}>+ Tambah Section</button>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
              Bikin row film custom dgn pilih film manual. Cocok utk "Pilihan Manager", "Film Akhir Pekan", dll. Muncul di bawah row default.
            </div>
            {customSections.length === 0 && (
              <div style={{ padding: 24, color: "#6b7280", fontSize: 12, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                Belum ada custom section. Klik "+ Tambah Section" di atas.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {customSections.map((s, si) => {
                const isEditing = editingSectionIdx === si;
                const selectedFilms = films.filter(f => (s.film_ids || []).includes(f.id));
                return (
                  <div key={s.id} style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <input value={s.title} onChange={e => setCustomSections(arr => arr.map((x, i) => i === si ? { ...x, title: e.target.value } : x))} placeholder="🎯 Judul Section" style={{ ...inputStyle, flex: 1, fontWeight: 700 }} />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
                        <input type="checkbox" checked={s.visible !== false} onChange={e => setCustomSections(arr => arr.map((x, i) => i === si ? { ...x, visible: e.target.checked } : x))} />
                        Visible
                      </label>
                      <button onClick={() => setEditingSectionIdx(isEditing ? -1 : si)} style={btnStyle("ghost")}>{isEditing ? "Tutup" : "Pilih Film"}</button>
                      <button onClick={() => {
                        if (!confirm(`Hapus section "${s.title}"?`)) return;
                        setCustomSections(arr => arr.filter((_, i) => i !== si));
                      }} style={btnStyle("danger-mini")}>🗑 Hapus</button>
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 6 }}>
                      {(s.film_ids || []).length} film terpilih
                      {selectedFilms.length > 0 && ": " + selectedFilms.map(f => f.title).join(", ").slice(0, 80) + (selectedFilms.map(f => f.title).join(", ").length > 80 ? "..." : "")}
                    </div>
                    {isEditing && (
                      <div style={{ marginTop: 10, padding: 12, background: "rgba(0,0,0,0.25)", borderRadius: 8 }}>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>Pilih film (klik utk toggle):</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 240, overflowY: "auto" }}>
                          {films.length === 0 && <div style={{ fontSize: 12, color: "#6b7280" }}>Loading films…</div>}
                          {films.map(f => {
                            const sel = (s.film_ids || []).includes(f.id);
                            return (
                              <button key={f.id} onClick={() => setCustomSections(arr => arr.map((x, i) => i === si ? {
                                ...x,
                                film_ids: sel ? (x.film_ids || []).filter(id => id !== f.id) : [...(x.film_ids || []), f.id],
                              } : x))} style={{
                                padding: "5px 10px", fontSize: 11, fontWeight: 700,
                                background: sel ? "#fb923c" : "rgba(255,255,255,0.06)",
                                color: sel ? "#fff" : "#e5e7eb",
                                border: `1px solid ${sel ? "#fb923c" : "rgba(255,255,255,0.12)"}`,
                                borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
                              }}>
                                {sel ? "✓ " : ""}{f.title}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {tab === "heros" && (
        <div>
          <div style={{ marginBottom: 16, fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>
            Edit tag, judul, sub-judul untuk hero banner di tiap page (Promo, Studio, Locations, About, FAQ).
            Kosongkan field utk pakai default (placeholder = default text).
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {PAGE_HERO_META.map(p => {
              const open = openHeroKey === p.key;
              const h = pageHeros[p.key] || {};
              const placeholder = p.placeholder;
              const isCustomized = !!(h.tag || h.title || h.subtitle || h.accent);
              return (
                <div key={p.key} style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
                  <button onClick={() => setOpenHeroKey(open ? null : p.key)} style={{
                    width: "100%", display: "flex", alignItems: "center", padding: "12px 14px", gap: 10,
                    background: open ? "rgba(251,146,60,0.06)" : "transparent",
                    border: "none", color: "#fff", fontFamily: "inherit", cursor: "pointer", textAlign: "left",
                    borderBottom: open ? "1px solid rgba(255,255,255,0.06)" : "none",
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{p.label}</span>
                    {isCustomized && (
                      <span style={{ padding: "2px 8px", fontSize: 9, fontWeight: 800, color: "#fb923c", background: "rgba(251,146,60,0.15)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 999, letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace" }}>CUSTOM</span>
                    )}
                    <span style={{ color: "#9ca3af", fontSize: 16 }}>{open ? "▲" : "▼"}</span>
                  </button>
                  {open && (
                    <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <Field label="Tag (badge atas)"
                        value={h.tag || ""}
                        onChange={v => setPageHeros(ph => ({ ...ph, [p.key]: { ...ph[p.key], tag: v } }))}
                        placeholder={placeholder.tag} />
                      <Field label="Title (judul besar)"
                        value={h.title || ""}
                        onChange={v => setPageHeros(ph => ({ ...ph, [p.key]: { ...ph[p.key], title: v } }))}
                        placeholder={placeholder.title} />
                      <Field label="Subtitle (paragraf)"
                        value={h.subtitle || ""}
                        onChange={v => setPageHeros(ph => ({ ...ph, [p.key]: { ...ph[p.key], subtitle: v } }))}
                        placeholder={placeholder.subtitle}
                        multiline />
                      <Field label="Accent (emoji badge)"
                        value={h.accent || ""}
                        onChange={v => setPageHeros(ph => ({ ...ph, [p.key]: { ...ph[p.key], accent: v } }))}
                        placeholder={placeholder.accent}
                        narrow />
                      {isCustomized && (
                        <button onClick={() => setPageHeros(ph => ({ ...ph, [p.key]: { tag: "", title: "", subtitle: "", accent: "" } }))} style={{ alignSelf: "flex-start", ...btnStyle("ghost"), fontSize: 11 }}>
                          ↺ Clear (pakai default)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* CUSTOM PAGES — admin bikin page baru */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "#fff", margin: 0 }}>➕ Custom Pages (Halaman Baru)</h3>
              <button onClick={() => {
                setCustomPages(p => [...p, { slug: `page-${Date.now()}`, hero: { tag: "", title: "Halaman Baru", subtitle: "", accent: "📄" }, body: "", visible: true }]);
                setEditingPageIdx(customPages.length);
              }} style={btnStyle("primary")}>+ Tambah Page</button>
            </div>
            <div style={{ marginBottom: 12, fontSize: 12, color: "#9ca3af", lineHeight: 1.5 }}>
              Buat halaman baru selain Promo/Studio/dll. URL: <code style={{ color: "#fb923c" }}>?movies=1#step=&lt;slug&gt;</code>. Untuk muncul di header nav, tambahkan ke Nav Header dgn target = slug page.
            </div>
            {customPages.length === 0 && (
              <div style={{ padding: 24, color: "#6b7280", fontSize: 12, textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                Belum ada custom page. Klik "+ Tambah Page" di atas.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {customPages.map((p, pi) => {
                const isEditing = editingPageIdx === pi;
                return (
                  <div key={pi} style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: "#fb923c", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, padding: "3px 8px", background: "rgba(251,146,60,0.1)", borderRadius: 4 }}>/{p.slug}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.hero?.title || p.slug}</span>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
                        <input type="checkbox" checked={p.visible !== false} onChange={e => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, visible: e.target.checked } : x))} />
                        Visible
                      </label>
                      <button onClick={() => setEditingPageIdx(isEditing ? -1 : pi)} style={btnStyle("ghost")}>{isEditing ? "Tutup" : "Edit"}</button>
                      <button onClick={() => {
                        if (!confirm(`Hapus page "${p.hero?.title || p.slug}"?`)) return;
                        setCustomPages(arr => arr.filter((_, i) => i !== pi));
                      }} style={btnStyle("danger-mini")}>🗑 Hapus</button>
                    </div>
                    {isEditing && (
                      <div style={{ marginTop: 8, padding: 12, background: "rgba(0,0,0,0.25)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                        <Field label="Slug (URL identifier — lowercase, no spasi)" value={p.slug}
                          onChange={v => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, slug: v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "") } : x))}
                          placeholder="karier" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8 }}>
                          <Field label="Hero Tag" value={p.hero?.tag || ""}
                            onChange={v => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, hero: { ...x.hero, tag: v } } : x))}
                            placeholder="Karier" />
                          <Field label="Accent" value={p.hero?.accent || ""}
                            onChange={v => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, hero: { ...x.hero, accent: v } } : x))}
                            placeholder="💼" narrow />
                        </div>
                        <Field label="Hero Title" value={p.hero?.title || ""}
                          onChange={v => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, hero: { ...x.hero, title: v } } : x))}
                          placeholder="Karier di KaryaOS" />
                        <Field label="Hero Subtitle" value={p.hero?.subtitle || ""}
                          onChange={v => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, hero: { ...x.hero, subtitle: v } } : x))}
                          placeholder="Bergabunglah dengan tim kami..." multiline />
                        <Field label="Body (plain text atau HTML — diawali < untuk HTML)" value={p.body || ""}
                          onChange={v => setCustomPages(arr => arr.map((x, i) => i === pi ? { ...x, body: v } : x))}
                          placeholder="Lowongan Posisi:&#10;- Frontend Developer&#10;- Backend Developer&#10;&#10;Atau pakai &lt;p&gt;HTML&lt;/p&gt;" multiline />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Floating save button */}
      <div style={{ position: "sticky", bottom: 0, marginTop: 30, padding: "14px 0", background: "linear-gradient(to top, #0a0e16 60%, transparent)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={save} disabled={saving} style={btnStyle("primary", saving)}>{saving ? "Menyimpan…" : "💾 Simpan Perubahan"}</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, multiline, narrow }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 64, fontFamily: "inherit", lineHeight: 1.5 }} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, maxWidth: narrow ? 100 : "100%" }} />
      )}
    </label>
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
