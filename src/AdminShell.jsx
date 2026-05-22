// AdminShell.jsx — unified admin shell.
//
// Every admin surface (home, tools, command, reports, members, promo, shift,
// ESB, old Admin) is an internal `view` here instead of a separate top-level
// App scene.
//
// Phase 1: routing — surfaces are internal views, not App scenes.
// Phase 2/2b: one persistent shell TopBar across every view. The surface
//   components are still untouched — 9 of them have a position:fixed root, so
//   the content area carries a `transform` which makes it the containing
//   block for those fixed roots (CSS spec): they're confined below the
//   TopBar without editing any component.
import { useState } from "react";
import AdminHome from "./AdminHome.jsx";
import AdminTools from "./AdminTools.jsx";
import Admin from "./Admin.jsx";
import CommandCenter from "./CommandCenter.jsx";
import Report from "./Report.jsx";
import ESBSync from "./ESBSync.jsx";
import ESBNotif from "./ESBNotif.jsx";
import MemberList from "./MemberList.jsx";
import PromoManager from "./PromoManager.jsx";
import ShiftManager from "./ShiftManager.jsx";

const VIEW_LABELS = {
  home: "Beranda", tools: "Admin Tools", command: "Command Center",
  admin: "Operasional Outlet", report: "Laporan", "esb-sync": "ESB Sync",
  "esb-notif": "ESB Notif", members: "Member & Customer", promo: "Promo", shift: "Shift",
};

const S = {
  shell: { display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#050810" },
  bar: {
    height: 44, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0 14px", background: "#0a0e16", borderBottom: "1px solid #1e2530",
    fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif", zIndex: 1,
  },
  brand: { fontFamily: "'Space Mono',monospace", fontSize: 13, fontWeight: 700, letterSpacing: 1.5, color: "#f59e0b" },
  sep: { color: "#3a4150", margin: "0 9px" },
  viewName: { fontSize: 13, fontWeight: 600, color: "#e6edf3" },
  right: { display: "flex", alignItems: "center", gap: 8 },
  btn: {
    display: "flex", alignItems: "center", gap: 5, background: "#161b22", border: "1px solid #21262d",
    borderRadius: 7, padding: "6px 12px", color: "#e6edf3", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "inherit",
  },
  logout: {
    background: "#F8717118", border: "1px solid #F8717144", borderRadius: 7, padding: "6px 12px",
    color: "#F87171", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  },
  // `transform` makes this the containing block for the surfaces' position:fixed roots
  content: { flex: 1, position: "relative", transform: "translateZ(0)", overflow: "auto" },
};

export default function AdminShell({ initialView = "home", adminSession, onLogout, onExitKiosk }) {
  const [view, setView] = useState(initialView);
  const [toolsTab, setToolsTab] = useState("dashboard");
  const [adminTab, setAdminTab] = useState("orders");

  // single navigation entry point — replaces App-level setScene for admin
  const nav = (v, arg) => {
    if (v === "tools") setToolsTab(arg || "dashboard");
    if (v === "admin") setAdminTab(arg || "orders");
    setView(v || "home");
  };

  let surface;
  switch (view) {
    case "tools":
      surface = <AdminTools onBack={() => nav("home")} initialTab={toolsTab} />;
      break;
    case "command":
      surface = <CommandCenter />;
      break;
    case "admin":
      surface = <Admin initialTab={adminTab} adminSession={adminSession} onLogout={onLogout}
        onExit={() => nav("home")} onReport={() => nav("report")}
        onESBSync={() => nav("esb-sync")} onESBNotif={() => nav("esb-notif")}
        onMembers={() => nav("members")} onPromo={() => nav("promo")} onShift={() => nav("shift")}
        onTools={(tab) => nav(tab === "command" ? "command" : "tools", tab)} />;
      break;
    case "report":    surface = <Report onBack={() => nav("home")} />; break;
    case "esb-sync":  surface = <ESBSync onBack={() => nav("home")} />; break;
    case "esb-notif": surface = <ESBNotif onBack={() => nav("home")} />; break;
    case "members":   surface = <MemberList onBack={() => nav("home")} />; break;
    case "promo":     surface = <PromoManager onBack={() => nav("home")} />; break;
    case "shift":     surface = <ShiftManager onBack={() => nav("home")} />; break;
    default:
      surface = <AdminHome adminSession={adminSession} onLogout={onLogout}
        onExit={onExitKiosk} onNav={nav} />;
  }

  return (
    <div style={S.shell}>
      <header style={S.bar} className="no-print">
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={S.brand}>🛠 KARYAOS</span>
          <span style={S.sep}>›</span>
          <span style={S.viewName}>{VIEW_LABELS[view] || "Admin"}</span>
        </div>
        <div style={S.right}>
          {view !== "home" && (
            <button style={S.btn} onClick={() => nav("home")} title="Kembali ke Beranda">🏠 Beranda</button>
          )}
          <button style={S.logout} onClick={onLogout} title="Keluar admin">Keluar</button>
        </div>
      </header>
      <div style={S.content}>
        {surface}
      </div>
    </div>
  );
}
