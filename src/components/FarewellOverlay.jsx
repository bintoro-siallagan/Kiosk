// src/components/FarewellOverlay.jsx
//
// Sambutan perpisahan — saat kasir/admin logout, sebelum benar-benar
// keluar, tampilkan overlay 2.5 detik dgn pesan hangat sesuai waktu.
//
// Filosofi karyaOS: setiap "pulang" dari karyaOS = pulang ke kehidupan
// nyata. Sistem harus mengucapkan "sampai bertemu lagi", bukan slam pintu.
//
// Cara pakai:
//   const [farewell, setFarewell] = useState(null);
//   ...
//   onClick={() => setFarewell({ name: cashier.name, then: () => doLogout() })}
//   ...
//   {farewell && <FarewellOverlay name={farewell.name} onDone={farewell.then} />}

import React, { useEffect } from 'react';

export default function FarewellOverlay({ name = 'Sahabat', onDone, dwellMs = 2500 }) {
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), dwellMs);
    return () => clearTimeout(t);
  }, [onDone, dwellMs]);

  const h = new Date().getHours();
  const msg = h >= 5 && h < 11  ? 'Selamat menjalankan harimu.'
            : h >= 11 && h < 15 ? 'Selamat menikmati siangmu.'
            : h >= 15 && h < 18 ? 'Selamat menikmati soremu.'
            : 'Selamat istirahat malam ini.';

  const titleMsg = h < 18 ? 'Sampai bertemu lagi' : 'Sampai bertemu besok';

  return (
    <div style={S.overlay} onClick={onDone}>
      <style>{CSS}</style>
      <div style={S.content}>
        <div style={S.icon}>🍃</div>
        <div style={S.eyebrow}>TERIMA KASIH</div>
        <h1 style={S.title}>{titleMsg}, {name}.</h1>
        <p style={S.sub}>{msg}</p>
      </div>
    </div>
  );
}

const CSS = `
@keyframes fareFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fareGreet {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'radial-gradient(circle at center, rgba(99,102,241,0.20) 0%, rgba(10,14,22,0.96) 70%)',
    backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    animation: 'fareFadeIn 0.4s ease',
    fontFamily: '"Geist", system-ui, -apple-system, sans-serif',
  },
  content: { textAlign: 'center', color: '#fff', maxWidth: 480, padding: 20 },
  icon: { fontSize: 56, marginBottom: 16, filter: 'drop-shadow(0 6px 16px rgba(99,102,241,0.35))' },
  eyebrow: {
    fontSize: 11, letterSpacing: 3, color: '#a5b4fc', fontWeight: 600,
    marginBottom: 10, textTransform: 'uppercase',
    animation: 'fareGreet 0.5s 0.1s both',
  },
  title: {
    fontSize: 32, fontWeight: 800, margin: '0 0 14px', letterSpacing: -0.5, lineHeight: 1.15,
    background: 'linear-gradient(180deg, #fff 0%, #c7d2fe 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    animation: 'fareGreet 0.5s 0.25s both',
  },
  sub: {
    fontSize: 15, color: '#cbd5e1', lineHeight: 1.5, margin: 0, fontStyle: 'italic',
    animation: 'fareGreet 0.5s 0.4s both',
  },
};
