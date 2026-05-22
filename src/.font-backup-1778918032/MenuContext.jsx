import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api.js";

const MenuContext = createContext(null);

export function MenuProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error,  setError]  = useState(null);

  useEffect(() => {
    let mounted = true;
    api.getMenuConfig()
      .then(cfg => { if (mounted) setConfig(cfg); })
      .catch(e  => { if (mounted) setError(e.message || "Failed to load menu"); });
    return () => { mounted = false; };
  }, []);

  if (error) return (
    <div style={{minHeight:"100vh",background:"#050810",color:"#f87171",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",gap:10}}>
      <div style={{fontSize:48}}>⚠️</div>
      <div style={{fontSize:16,fontWeight:600}}>Gagal memuat menu</div>
      <div style={{fontSize:12,color:"#888"}}>{error}</div>
    </div>
  );

  if (!config) return (
    <div style={{minHeight:"100vh",background:"#050810",color:"#888",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Inter',sans-serif",fontSize:14,letterSpacing:2}}>
      Loading menu…
    </div>
  );

  return <MenuContext.Provider value={config}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu() must be inside <MenuProvider>");
  return ctx;
}
