// src/Admin/AdminNotificationCenter.jsx
// Notification Center — hub alert terpusat.

import { useState, useEffect, useCallback } from "react";
import { useUiKit } from "../components/uiKit.jsx";

const AC = "#db2777";
const PRI = { high: { c: "#ef4444", l: "TINGGI" }, medium: { c: "#f59e0b", l: "SEDANG" }, low: { c: "#3b82f6", l: "RENDAH" } };
const CAT_C = { Inventory: "#0891b2", Operations: "#f59e0b", Finance: "#10b981" };

export default function AdminNotificationCenter({ apiBase = "" }) {
  const { confirm } = useUiKit();
  const [d, setD] = useState(null);
  const [filter, setFilter] = useState("all");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    fetch(`${apiBase}/api/notification-center`).then(r => r.json()).then(setD).catch(() => {});
  }, [apiBase]);
  useEffect(() => { load(); }, [load]);

  const dismiss = (n) => {
    fetch(`${apiBase}/api/notification-center/${encodeURIComponent(n.key)}/dismiss`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).then(r => r.json()).then(j => { if (j.ok) load(); }).catch(() => {});
  };

  const saveEdit = async () => {
    // PATCH = mark as dismissed (idempotent)
    const r = await fetch(`${apiBase}/api/notification-center/${encodeURIComponent(editing.key)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissed: true }),
    });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Disimpan (dismissed)"); setEditing(null); load(); }
    else setMsg(j.error || "gagal");
  };
  const remove = async (item) => {
    const ok = await confirm({
      title: `Hapus "${item.title || '#' + item.key}"?`,
      message: "Notifikasi akan dihapus permanen. Tidak bisa dibatalkan.",
      danger: true, okLabel: "Hapus",
    });
    if (!ok) return;
    const r = await fetch(`${apiBase}/api/notification-center/${encodeURIComponent(item.key)}`, { method: "DELETE" });
    const j = await r.json();
    if (j.ok) { setMsg("✓ Dihapus"); load(); }
    else setMsg(j.error || "gagal");
  };

  if (!d) return <div style={{ padding: 30, color: "#5b6470" }}>Memuat Notification Center…</div>;
  const s = d.summary;
  const list = filter === "all" ? d.notifications : d.notifications.filter(n => n.category === filter);

  return (
    <div>
      <div style={S.intro}>
        🔔 <b style={{ color: "#f472b6" }}>NOTIFICATION CENTER</b> — hub alert terpusat. Agregasi notifikasi
        dari seluruh modul operasi (stok, batch/expiry, insiden, aset, pembayaran) — satu pintu.
      </div>

      <div style={S.kpiRow}>
        <Kpi label="Total Alert" v={String(s.total)} c={AC} />
        <Kpi label="Prioritas Tinggi" v={String(s.high)} c={s.high > 0 ? "#ef4444" : "#10b981"} />
        <Kpi label="Prioritas Sedang" v={String(s.medium)} c="#f59e0b" />
        <Kpi label="Kategori" v={String(s.by_category.length)} c="#a855f7" />
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
          <span style={S.kicker}>FILTER:</span>
          <Chip label={`Semua (${s.total})`} on={filter === "all"} c={AC} onClick={() => setFilter("all")} />
          {s.by_category.map(c => (
            <Chip key={c.category} label={`${c.category} (${c.count})`} on={filter === c.category} c={CAT_C[c.category] || "#9ca3af"} onClick={() => setFilter(c.category)} />
          ))}
        </div>
      </div>

      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.kicker}>🔔 ALERT FEED — {list.length}</div>
        {msg ? <div style={{ fontSize: 12, margin: "8px 2px 0", color: msg.startsWith("✓") ? "#10b981" : "#f87171" }}>{msg}</div> : null}
        {list.length === 0 ? (
          <div style={{ fontSize: 13, color: "#10b981", padding: "14px 0", textAlign: "center" }}>✓ Tidak ada alert. Semua terkendali.</div>
        ) : list.map(n => {
          const pri = PRI[n.priority] || PRI.low;
          return (
            <div key={n.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: "1px solid #161b22" }}>
              <span style={{ fontSize: 20, width: 26, textAlign: "center" }}>{n.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{n.title}</div>
                <div style={{ fontSize: 11, color: "#9da7b3" }}>{n.detail} <span style={{ color: "#5b6470" }}>· {n.source}</span></div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: CAT_C[n.category] || "#9ca3af", fontFamily: "'Geist Mono',monospace" }}>{n.category.toUpperCase()}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: pri.c, background: pri.c + "1f", border: `1px solid ${pri.c}55`, borderRadius: 5, padding: "2px 8px", fontFamily: "'Geist Mono',monospace" }}>{pri.l}</span>
              <button onClick={() => dismiss(n)} style={S.btn}>✓ Selesai</button>
              <button onClick={() => setEditing({ ...n })} title="Edit" style={{ background: "#f59e0b18", border: "1px solid #f59e0b44", color: "#f59e0b", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>✏️</button>
              <button onClick={() => remove(n)} title="Hapus" style={{ background: "#ef444418", border: "1px solid #ef444444", color: "#ef4444", padding: "3px 7px", borderRadius: 5, fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>🗑️</button>
            </div>
          );
        })}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 12, padding: 22, maxWidth: 520, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 14 }}>✏️ Aksi — {editing.title || editing.key}</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={modalLbl}>Key</label>
                <input value={editing.key || ""} disabled style={{ ...modalInp, opacity: 0.6 }} />
              </div>
              <div>
                <label style={modalLbl}>Judul</label>
                <input value={editing.title || ""} disabled style={{ ...modalInp, opacity: 0.6 }} />
              </div>
              <div>
                <label style={modalLbl}>Kategori</label>
                <input value={editing.category || ""} disabled style={{ ...modalInp, opacity: 0.6 }} />
              </div>
              <div>
                <label style={modalLbl}>Prioritas</label>
                <input value={editing.priority || ""} disabled style={{ ...modalInp, opacity: 0.6 }} />
              </div>
              <div style={{ fontSize: 11, color: "#9da7b3", padding: "8px 10px", background: "#161b22", borderRadius: 6, lineHeight: 1.5 }}>
                Notifikasi disintesis dari modul lain (stok, batch, insiden, dll). Edit data sumber buat ubah isi. Tombol Simpan akan menandai notifikasi ini sebagai dismissed.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setEditing(null)} style={{ background: "#161b22", border: "1px solid #30363d", color: "#9ca3af", padding: "8px 14px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Batal</button>
              <button onClick={saveEdit} style={{ background: "#10b981", color: "#04130c", border: "none", padding: "8px 18px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>💾 Tandai Dismissed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalInp = { background: "#0a0e16", border: "1px solid #30363d", borderRadius: 7, padding: "8px 11px", color: "#e6edf3", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };
const modalLbl = { fontSize: 10, color: "#9ca3af", fontFamily: "'Geist Mono',monospace", letterSpacing: 0.4, display: "block", marginBottom: 4 };

function Chip({ label, on, c, onClick }) {
  return (
    <button onClick={onClick} style={{ background: on ? c : "#0a0e16", border: `1px solid ${on ? c : "#21262d"}`, color: on ? "#0a0e16" : "#9da7b3", fontSize: 12, fontWeight: 700, padding: "5px 11px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
  );
}
function Kpi({ label, v, c }) {
  return (
    <div style={{ background: "#0d1117", border: "1px solid #161b22", borderTop: `2px solid ${c}`, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontSize: 9, color: "#5b6470", letterSpacing: 0.5, fontFamily: "'Geist Mono',monospace" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: "'Geist Mono',monospace", marginTop: 4 }}>{v}</div>
    </div>
  );
}

const S = {
  intro: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#9da7b3", lineHeight: 1.6, marginBottom: 14 },
  card: { background: "#0d1117", border: "1px solid #161b22", borderRadius: 12, padding: 16 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1, color: "#5b6470", fontFamily: "'Geist Mono',monospace" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12 },
  btn: { background: "transparent", border: "1px solid #21262d", color: "#9da7b3", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
};
