import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api.js";
import ConnectionError, { LoadingScreen } from "./components/ConnectionError.jsx";

const MenuContext = createContext(null);

export function MenuProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error,  setError]  = useState(null);
  const [tick,   setTick]   = useState(0);

  const load = useCallback(() => {
    setError(null);
    api.getMenuConfig()
      .then(cfg => setConfig(cfg))
      .catch(e  => setError(e));
  }, []);

  useEffect(() => { load(); }, [load, tick]);

  if (error) return (
    <ConnectionError
      error={error}
      onRetry={() => setTick(t => t + 1)}
      title="Tidak dapat menghubungi server menu"
      subtitle="Sistem akan otomatis mencoba kembali. Pastikan perangkat ini terhubung ke jaringan outlet."
    />
  );

  if (!config) return <LoadingScreen label="Menyiapkan menu" sub="Menghubungkan ke server outlet…" />;

  return <MenuContext.Provider value={config}>{children}</MenuContext.Provider>;
}

export function useMenu() {
  const ctx = useContext(MenuContext);
  if (!ctx) throw new Error("useMenu() must be inside <MenuProvider>");
  return ctx;
}
