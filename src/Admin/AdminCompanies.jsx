// AdminCompanies — manage all companies (super-admin)
// CRUD: list, add new client, edit per-row, soft/hard delete, switch-to (impersonate)

import { useEffect, useState, useCallback } from "react";

export default function AdminCompanies({ onBack }) {
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Cek apakah user super-admin
  const ctx = (() => { try { return JSON.parse(localStorage.getItem("karya_company_ctx") || "null"); } catch { return null; } })();
  const isSuperAdmin = !!(ctx?.is_super_admin || ctx?.company_id == null);

  const load = useCallback(() => {
    setError("");
    fetch("/api/companies/", { headers: { "x-super-admin": "true" } })
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d)))
      .then(d => setCompanies(Array.isArray(d) ? d : (d.companies || d.data || [])))
      .catch(e => setError(e.error || e.message || "Load failed"));
  }, []);
  useEffect(load, [load]);

  const filtered = (companies || []).filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name || "").toLowerCase().includes(q) || (c.code || "").toLowerCase().includes(q);
  });

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditForm({
      code: c.code || "", name: c.name || "", primary_vertical: c.primary_vertical || "fnb",
      brand_color: c.brand_color || "#FF6B35", contact_email: c.contact_email || "",
      contact_phone: c.contact_phone || "", address: c.address || "", status: c.status || "active",
    });
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/companies/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-super-admin": "true" },
        body: JSON.stringify(editForm),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      cancelEdit(); load();
    } catch (e) { alert("✗ " + e.message); }
    finally { setSaving(false); }
  };

  const removeCompany = async (c, hard = false) => {
    const word = hard ? "HAPUS PERMANEN" : "Nonaktifkan";
    if (!confirm(`${word} "${c.name}" (${c.code})?\n${hard ? "⚠️ Semua data terkait juga bisa terhapus." : "(Bisa di-aktifkan lagi nanti via edit status)"}`)) return;
    try {
      const url = hard ? `/api/companies/${c.id}?hard=1&confirm=destroy` : `/api/companies/${c.id}`;
      const r = await fetch(url, { method: "DELETE", headers: { "x-super-admin": "true" } });
      const j = await r.json();
      if (!r.ok) {
        // Backend mungkin minta confirm utk hard delete
        if (j.error?.includes("tickets")) {
          if (confirm(`${j.error} Lanjutkan force delete?`)) {
            return removeCompany(c, true);
          }
          return;
        }
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      load();
    } catch (e) { alert("✗ " + e.message); }
  };

  const switchTo = async (c) => {
    try {
      const { startImpersonate } = await import("../companyAuth.js");
      const ok = startImpersonate({
        id: c.id, code: c.code, name: c.name,
        primary_vertical: c.primary_vertical, brand_color: c.brand_color, logo_url: c.logo_url,
      });
      if (ok) window.location.reload();
    } catch (e) { alert("✗ " + e.message); }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 40, color: "#fca5a5", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Super-admin Only</div>
        <div style={{ fontSize: 13, color: "#9ca3af" }}>Modul Companies hanya untuk super-admin platform.</div>
        {onBack && <button onClick={onBack} style={btn("ghost")}>← Kembali</button>}
      </div>
    );
  }

  if (!companies && !error) {
    return <div style={{ padding: 40, color: "#9ca3af" }}>Memuat companies…</div>;
  }

  return (
    <div style={{ padding: "20px 24px", color: "#e5e7eb", maxWidth: 1300, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          {onBack && <button onClick={onBack} style={btn("ghost")}>← Kembali</button>}
          <h1 style={{ display: "inline-block", marginLeft: 16, fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>
            🏢 Companies (Multi-Tenant)
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama/code…"
            style={inputStyle} />
          <button onClick={() => setShowAdd(true)} style={btn("primary")}>+ Tambah Client</button>
        </div>
      </div>

      <p style={{ color: "#9ca3af", fontSize: 13, marginBottom: 16 }}>
        {companies.length} total · {companies.filter(c => c.status === "active").length} aktif
      </p>

      {error && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, marginBottom: 16, fontSize: 13, color: "#fca5a5" }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
        {/* Header row */}
        <div style={{ display: "grid", gridTemplateColumns: "60px 100px 1fr 120px 120px 120px 280px", padding: "10px 14px", background: "rgba(255,255,255,0.04)", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, gap: 8 }}>
          <div>ID</div>
          <div>Code</div>
          <div>Name</div>
          <div>Vertical</div>
          <div>Status</div>
          <div>Brand Color</div>
          <div style={{ textAlign: "right" }}>Actions</div>
        </div>
        {filtered.map(c => {
          const isEditing = editingId === c.id;
          return (
            <div key={c.id}>
              <div style={{
                display: "grid", gridTemplateColumns: "60px 100px 1fr 120px 120px 120px 280px",
                padding: "10px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", alignItems: "center", gap: 8,
                background: isEditing ? "rgba(251,146,60,0.04)" : "transparent",
              }}>
                <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "'JetBrains Mono',monospace" }}>{c.id}</div>
                <div style={{ fontSize: 12, color: "#fb923c", fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{c.code}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{c.name}</div>
                  {c.contact_email && <div style={{ fontSize: 10, color: "#6b7280" }}>{c.contact_email}</div>}
                </div>
                <div>
                  <span style={pillStyle(c.primary_vertical)}>{c.primary_vertical || "—"}</span>
                </div>
                <div>
                  <span style={statusPill(c.status)}>{c.status || "active"}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: c.brand_color || "#374151", border: "1px solid rgba(255,255,255,0.1)" }} />
                  <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "'JetBrains Mono',monospace" }}>{c.brand_color || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                  <button onClick={() => switchTo(c)} title="Login as this company" style={btn("ghost-mini")}>⟲ Switch</button>
                  <button onClick={() => startEdit(c)} style={btn("ghost-mini")}>✏️ Edit</button>
                  {c.id !== 1 && (
                    <button onClick={() => removeCompany(c, false)} style={btn("danger-mini")}>🗑 Hapus</button>
                  )}
                </div>
              </div>
              {isEditing && (
                <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.04)", background: "rgba(0,0,0,0.3)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 10, marginBottom: 12 }}>
                    <EditField label="Code" value={editForm.code} onChange={v => setEditForm(f => ({ ...f, code: v }))} placeholder="UNIQUE-CODE" />
                    <EditField label="Name" value={editForm.name} onChange={v => setEditForm(f => ({ ...f, name: v }))} placeholder="PT Nama Brand" />
                    <EditFieldSelect label="Vertical" value={editForm.primary_vertical} onChange={v => setEditForm(f => ({ ...f, primary_vertical: v }))} options={[["fnb","F&B"],["cinema","Cinema"],["hybrid","Hybrid (both)"]]} />
                    <EditFieldSelect label="Status" value={editForm.status} onChange={v => setEditForm(f => ({ ...f, status: v }))} options={[["active","Active"],["inactive","Inactive"],["trial","Trial"],["suspended","Suspended"]]} />
                    <EditField label="Brand Color" value={editForm.brand_color} onChange={v => setEditForm(f => ({ ...f, brand_color: v }))} placeholder="#FF6B35" />
                    <EditField label="Contact Email" value={editForm.contact_email} onChange={v => setEditForm(f => ({ ...f, contact_email: v }))} placeholder="info@brand.com" />
                    <EditField label="Contact Phone" value={editForm.contact_phone} onChange={v => setEditForm(f => ({ ...f, contact_phone: v }))} placeholder="+62 812..." />
                    <EditField label="Address" value={editForm.address} onChange={v => setEditForm(f => ({ ...f, address: v }))} placeholder="Jl. ..." />
                  </div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={cancelEdit} style={btn("ghost")}>Batal</button>
                    <button onClick={saveEdit} disabled={saving} style={btn("primary", saving)}>{saving ? "Menyimpan…" : "💾 Simpan"}</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 40, color: "#6b7280", textAlign: "center", fontSize: 13 }}>
            {search ? `Tidak ada hasil untuk "${search}"` : "Belum ada company"}
          </div>
        )}
      </div>

      {showAdd && <AddCompanyModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddCompanyModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    code: "", name: "", primary_vertical: "fnb",
    brand_color: "#FF6B35", contact_email: "", contact_phone: "", address: "", npwp: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setErr("Code & Name wajib diisi");
      return;
    }
    setSaving(true); setErr("");
    try {
      const r = await fetch("/api/companies/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-super-admin": "true" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      onSaved?.();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14,
        padding: 24, maxWidth: 560, width: "100%", color: "#e5e7eb",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff" }}>+ Tambah Client Baru</h2>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16, lineHeight: 1.6 }}>
          Buat tenant baru di platform. Code = identifier unik (uppercase, no spasi). Setelah dibuat, edit detail branding lewat tombol Edit di list.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <EditField label="Code *" value={form.code} onChange={v => setForm(f => ({ ...f, code: v.toUpperCase().replace(/\s+/g, "") }))} placeholder="MISAL-BRAND-XYZ" />
          <EditField label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="PT Nama Brand Anda" />
          <EditFieldSelect label="Vertical" value={form.primary_vertical} onChange={v => setForm(f => ({ ...f, primary_vertical: v }))} options={[["fnb","F&B"],["cinema","Cinema"],["hybrid","Hybrid (both)"]]} />
          <EditField label="Brand Color" value={form.brand_color} onChange={v => setForm(f => ({ ...f, brand_color: v }))} placeholder="#FF6B35" />
          <EditField label="Contact Email" value={form.contact_email} onChange={v => setForm(f => ({ ...f, contact_email: v }))} placeholder="info@brand.com" />
          <EditField label="Contact Phone" value={form.contact_phone} onChange={v => setForm(f => ({ ...f, contact_phone: v }))} placeholder="+62 812..." />
          <EditField label="Address" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="Jl. ..." />
        </div>
        {err && <div style={{ marginTop: 12, padding: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, color: "#fca5a5", fontSize: 12 }}>⚠️ {err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={onClose} style={btn("ghost")}>Batal</button>
          <button onClick={submit} disabled={saving} style={btn("primary", saving)}>{saving ? "Membuat…" : "+ Buat Client"}</button>
        </div>
      </div>
    </div>
  );
}

function EditField({ label, value, onChange, placeholder }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );
}
function EditFieldSelect({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

const inputStyle = {
  padding: "8px 12px", background: "#1e293b", border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6, color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none",
};

function btn(variant, disabled) {
  const base = {
    padding: "8px 14px", borderRadius: 8, border: "none",
    fontSize: 12.5, fontWeight: 700, fontFamily: "inherit",
    cursor: disabled ? "wait" : "pointer", opacity: disabled ? 0.6 : 1,
    transition: "all 0.15s", whiteSpace: "nowrap",
  };
  if (variant === "primary") return { ...base, background: "#fb923c", color: "#fff" };
  if (variant === "ghost") return { ...base, background: "transparent", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.12)" };
  if (variant === "ghost-mini") return { ...base, padding: "5px 10px", fontSize: 11, background: "rgba(255,255,255,0.04)", color: "#e5e7eb", border: "1px solid rgba(255,255,255,0.1)" };
  if (variant === "danger-mini") return { ...base, padding: "5px 10px", fontSize: 11, background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" };
  return base;
}

function pillStyle(vertical) {
  const colors = { fnb: ["#10b981", "rgba(16,185,129,0.15)"], cinema: ["#a855f7", "rgba(168,85,247,0.15)"], hybrid: ["#fbbf24", "rgba(251,191,36,0.15)"] };
  const [color, bg] = colors[vertical] || ["#6b7280", "rgba(107,114,128,0.15)"];
  return { padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 800, color, background: bg, border: `1px solid ${color}55`, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" };
}
function statusPill(status) {
  const colors = { active: ["#10b981", "rgba(16,185,129,0.15)"], trial: ["#fbbf24", "rgba(251,191,36,0.15)"], inactive: ["#ef4444", "rgba(239,68,68,0.15)"], suspended: ["#ef4444", "rgba(239,68,68,0.15)"] };
  const [color, bg] = colors[status] || ["#10b981", "rgba(16,185,129,0.15)"];
  return { padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 800, color, background: bg, border: `1px solid ${color}55`, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1, textTransform: "uppercase" };
}
