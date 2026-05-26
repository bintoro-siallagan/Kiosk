// src/CommandOutletDetail.jsx
// Command Center — Outlet Detail drill-down (Level 3).
// Detail operasional satu cabang: health breakdown, sales, workforce,
// stock, issue.

import { useState, useEffect, useCallback } from "react";
import { ErrorInline } from "./components/ConnectionError.jsx";
import API_HOST from "./apiBase.js";

const API = API_HOST;
const MONO = "var(--m)";
const fmtK = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "jt"
  : n >= 1e3 ? Math.round(n / 1e3) + "rb" : String(n || 0));
const STATUS = {
  healthy:   { col: "#10b981", dot: "🟢", label: "SEHAT" },
  attention: { col: "#f59e0b", dot: "🟡", label: "PERLU ATENSI" },
  critical:  { col: "#ef4444", dot: "🔴", label: "KRITIS" },
};
const SEV = { critical: "#ef4444", warning: "#f59e0b", info: "#3b82f6" };
const scoreCol = (s) => (s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444");
const fmtTime = (ts) => {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return "baru aja";
  if (diff < 3600) return Math.floor(diff / 60) + " mnt lalu";
  if (diff < 86400) return Math.floor(diff / 3600) + " jam lalu";
  return new Date(ts * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

export default function CommandOutletDetail({ outletId, onBack }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [resolving, setResolving] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/api/outlets/${outletId}`).then(r => r.json())
      .then(j => j.error ? setErr(j.error) : setD(j))
      .catch(e => setErr(String(e)));
  }, [outletId]);
  useEffect(() => { setD(null); setErr(""); load(); }, [outletId, load]);

  const resolveIssue = (issueId) => {
    setResolving(issueId);
    fetch(`${API}/api/outlets/${outletId}/issues/${issueId}/resolve`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    }).then(r => r.json()).then(() => load()).catch(() => {}).finally(() => setResolving(null));
  };

  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    setSavingNote(true);
    fetch(`${API}/api/outlets/${outletId}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }).then(r => r.json()).then(() => { setNoteText(""); load(); })
      .catch(() => {}).finally(() => setSavingNote(false));
  };
  const deleteNote = (noteId) => {
    fetch(`${API}/api/outlets/${outletId}/notes/${noteId}`, { method: "DELETE" })
      .then(() => load()).catch(() => {});
  };

  if (err) return <div style={{ padding: 20 }}><ErrorInline error={err} onRetry={() => { setErr(""); load && load(); }} /><button onClick={onBack} style={S.back}>← Kembali</button></div>;
  if (!d) return <div style={S.msg}>Memuat detail outlet…</div>;
  const o = d.outlet;
  const st = STATUS[o.status] || STATUS.attention;

  return (
    <div style={S.wrap}>
      <button onClick={onBack} style={S.back}>← Semua Outlet</button>

      <div style={{ ...S.card, borderColor: st.col + "55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: "#888", fontFamily: MONO, letterSpacing: 1 }}>📍 AREA {o.area.toUpperCase()}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#fff", marginTop: 2 }}>
              {o.name}{" "}
              {o.is_flagship ? <span style={{ fontSize: 11, color: "#fbbf24", fontFamily: MONO }}>★ FLAGSHIP</span> : null}
            </div>
            <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>👤 Manager: {o.manager}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 46, fontWeight: 900, color: st.col, fontFamily: MONO, lineHeight: 1 }}>{o.health_score}</div>
            <div style={{ fontSize: 10, color: "#888", letterSpacing: 1 }}>HEALTH SCORE</div>
            <div style={{ fontSize: 11, color: st.col, fontWeight: 700, marginTop: 3 }}>{st.dot} {st.label}</div>
          </div>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.kicker}>💚 HEALTH BREAKDOWN — 6 KOMPONEN</div>
        {d.health_components.map(c => (
          <div key={c.key} style={S.barRow}>
            <span style={{ width: 160, fontSize: 12, color: "#ccc", flexShrink: 0 }}>{c.key}</span>
            <div style={{ flex: 1, height: 14, background: "#161b22", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: c.score + "%", background: scoreCol(c.score) }} />
            </div>
            <span style={{ width: 38, textAlign: "right", fontFamily: MONO, fontSize: 13, fontWeight: 700, color: scoreCol(c.score), flexShrink: 0 }}>{c.score}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div style={S.card}>
          <div style={S.kicker}>💰 SALES HARI INI</div>
          <Big v={"Rp " + fmtK(d.sales.revenue)} c="#10b981" />
          <Row k="Growth vs kemarin" v={(d.sales.growth_pct >= 0 ? "+" : "") + d.sales.growth_pct + "%"} c={d.sales.growth_pct >= 0 ? "#10b981" : "#ef4444"} />
          <Row k="Capaian target" v={d.sales.target_pct + "%"} />
          <Row k="Transaksi" v={String(d.sales.transactions)} />
          <Row k="Avg bill" v={"Rp " + fmtK(d.sales.avg_bill)} />
        </div>
        <div style={S.card}>
          <div style={S.kicker}>👥 WORKFORCE</div>
          <Big v={d.workforce.on_duty + " / " + d.workforce.staff_count} c="#3b82f6" />
          <Row k="Total staff" v={String(d.workforce.staff_count)} />
          <Row k="On duty" v={String(d.workforce.on_duty)} />
          <Row k="Kehadiran" v={d.workforce.attendance_pct + "%"} c={d.workforce.attendance_pct >= 85 ? "#10b981" : "#f59e0b"} />
        </div>
        <div style={S.card}>
          <div style={S.kicker}>📦 STOCK & SUPPLY</div>
          <Big v={d.stock.total + " SKU"} c="#a78bfa" />
          <Row k="Aman" v={String(d.stock.ok)} c="#10b981" />
          <Row k="Menipis" v={String(d.stock.low)} c="#f59e0b" />
          <Row k="Kritis / habis" v={String(d.stock.critical)} c="#ef4444" />
        </div>
      </div>

      <div style={S.card}>
        <div style={S.kicker}>⚠️ ISSUE & RISK — {d.issues.open} OPEN · {d.issues.critical} KRITIS</div>
        {d.issues.list.length === 0 ? (
          <div style={{ color: "#10b981", fontSize: 13 }}>✓ Semua issue beres — outlet bersih! 🎉</div>
        ) : d.issues.list.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderBottom: "1px solid #161b22" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: SEV[it.severity], flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#ddd", flex: 1 }}>{it.text}</span>
            <span style={{ fontSize: 10, color: SEV[it.severity], fontFamily: MONO, textTransform: "uppercase" }}>{it.severity}</span>
            <button onClick={() => resolveIssue(it.id)} disabled={resolving === it.id}
              style={{ background: "#10b9811f", border: "1px solid #10b98155", color: "#10b981", fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 7, cursor: resolving === it.id ? "wait" : "pointer", fontFamily: MONO, flexShrink: 0 }}>
              {resolving === it.id ? "…" : "✓ Resolve"}
            </button>
          </div>
        ))}
      </div>

      <div style={S.card}>
        <div style={S.kicker}>📝 CATATAN CABANG — {d.notes.length}</div>
        <div style={{ display: "flex", gap: 8, marginBottom: d.notes.length ? 12 : 0 }}>
          <input value={noteText} onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addNote(); }}
            placeholder="Tulis catatan buat cabang ini…"
            style={{ flex: 1, background: "#080a0f", border: "1px solid #21262d", borderRadius: 8, padding: "9px 12px", color: "#e4e4e7", fontSize: 13, fontFamily: "inherit", outline: "none" }} />
          <button onClick={addNote} disabled={savingNote || !noteText.trim()}
            style={{ background: "#22d3ee1f", border: "1px solid #22d3ee55", color: "#22d3ee", fontSize: 12, fontWeight: 700, padding: "9px 16px", borderRadius: 8, cursor: savingNote ? "wait" : "pointer", fontFamily: MONO, flexShrink: 0 }}>
            {savingNote ? "…" : "+ Tambah"}
          </button>
        </div>
        {d.notes.map(n => (
          <div key={n.id} style={{ display: "flex", gap: 9, padding: "9px 0", borderBottom: "1px solid #161b22" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>🗒️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#ddd" }}>{n.text}</div>
              <div style={{ fontSize: 10, color: "#666", fontFamily: MONO, marginTop: 2 }}>{n.author} · {fmtTime(n.created_at)}</div>
            </div>
            <button onClick={() => deleteNote(n.id)} title="Hapus catatan"
              style={{ background: "transparent", border: "none", color: "#555", fontSize: 16, cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Big({ v, c }) {
  return <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: MONO, margin: "4px 0 8px" }}>{v}</div>;
}
function Row({ k, v, c }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #161b22", fontSize: 12 }}>
      <span style={{ color: "#888" }}>{k}</span>
      <b style={{ color: c || "#e4e4e7", fontFamily: MONO }}>{v}</b>
    </div>
  );
}

const S = {
  wrap: { display: "flex", flexDirection: "column", gap: 14 },
  msg: { padding: 40, textAlign: "center", color: "#666", fontSize: 14 },
  card: { background: "#0d1117", border: "1px solid #21262d", borderRadius: 14, padding: 18 },
  kicker: { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#888", fontFamily: MONO, marginBottom: 12 },
  barRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0" },
  back: { background: "#161b22", border: "1px solid #2d333b", color: "#cbd5e1", fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 8, cursor: "pointer", alignSelf: "flex-start", fontFamily: MONO },
};
