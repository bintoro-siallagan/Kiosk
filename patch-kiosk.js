#!/usr/bin/env node
/**
 * patch-kiosk.js — Auto-patch Kiosk.jsx untuk Sour Sally menu + ToppingPicker
 *
 * Jalankan: node patch-kiosk.js
 * Dari folder: ~/bites-kiosk/
 *
 * Yang dilakukan:
 *   1. Backup Kiosk.jsx → Kiosk.jsx.bak
 *   2. Tambah import menuData + ToppingPicker
 *   3. Ganti MENU array (burgers → Sour Sally)
 *   4. Update FoodImage palettes
 *   5. Ganti AddonModal → ToppingPicker
 */

const fs = require("fs");
const path = require("path");

const KIOSK_PATH = path.join(__dirname, "src", "Kiosk.jsx");

if (!fs.existsSync(KIOSK_PATH)) {
  console.error("❌ File tidak ditemukan:", KIOSK_PATH);
  console.error("   Jalankan dari ~/bites-kiosk/");
  process.exit(1);
}

// Backup
const backupPath = KIOSK_PATH + ".bak";
fs.copyFileSync(KIOSK_PATH, backupPath);
console.log("📦 Backup:", backupPath);

let code = fs.readFileSync(KIOSK_PATH, "utf8");
let changes = 0;

// ═══════════════════════════════════════════════════════════════
// 1. TAMBAH IMPORTS
// ═══════════════════════════════════════════════════════════════
const importLines = [
  'import { CATEGORIES, MENU_ITEMS, TOPPINGS, EXTRA_TOPPING_PRICE } from "./menuData.js";',
  'import ToppingPicker from "./ToppingPicker.jsx";',
];

for (const imp of importLines) {
  const modName = imp.includes("menuData") ? "menuData" : "ToppingPicker";
  if (code.includes(modName)) {
    console.log(`⏭️  Import ${modName} sudah ada, skip`);
  } else {
    // Tambah setelah baris import terakhir
    const lastImportIdx = code.lastIndexOf("\nimport ");
    if (lastImportIdx >= 0) {
      const endOfLine = code.indexOf("\n", lastImportIdx + 1);
      code = code.slice(0, endOfLine + 1) + imp + "\n" + code.slice(endOfLine + 1);
      changes++;
      console.log(`✅ Import ${modName} ditambahkan`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. GANTI MENU ARRAY
// ═══════════════════════════════════════════════════════════════
const menuStartPattern = /const MENU\s*=\s*\[/;
const menuMatch = code.match(menuStartPattern);

if (menuMatch) {
  const menuStartIdx = code.indexOf(menuMatch[0]);
  // Find matching ];
  let depth = 0;
  let menuEndIdx = -1;
  for (let i = menuStartIdx + menuMatch[0].length - 1; i < code.length; i++) {
    if (code[i] === "[") depth++;
    if (code[i] === "]") {
      depth--;
      if (depth === 0) {
        // Skip to semicolon if present
        menuEndIdx = code[i + 1] === ";" ? i + 2 : i + 1;
        break;
      }
    }
  }

  if (menuEndIdx > 0) {
    const newMenu = `const MENU = MENU_ITEMS.map(m => ({
  ...m,
  // Map cat id ke category string yang FoodImage butuh
  category: ({
    froyo: "🍦 Frozen Yogurt",
    smoothies: "🥤 Smoothies",
    yogulato: "🍨 Yogulato",
    takehome: "📦 Take Home",
    collab: "✨ Special",
  })[m.cat] || m.cat,
}))`;

    code = code.slice(0, menuStartIdx) + newMenu + code.slice(menuEndIdx);
    changes++;
    console.log("✅ MENU array diganti → MENU_ITEMS (Sour Sally)");
  } else {
    console.warn("⚠️  Gagal cari akhir MENU array, skip");
  }
} else {
  console.warn("⚠️  const MENU = [...] tidak ditemukan");
}

// ═══════════════════════════════════════════════════════════════
// 3. UPDATE FOODIMAGE PALETTES
// ═══════════════════════════════════════════════════════════════
const oldPalettes = `"🍔 Burgers":  ["#8B4513","#D2691E","#F4A460","#DEB887"],
    "🍕 Pizza":    ["#B22222","#FF6347","#FFD700","#F5F5DC"],
    "🥗 Salads":   ["#228B22","#32CD32","#90EE90","#ADFF2F"],
    "🍟 Sides":    ["#DAA520","#FFD700","#FFDEAD","#F5DEB3"],
    "🥤 Drinks":   ["#4169E1","#87CEEB","#00CED1","#48D1CC"],
    "🍰 Desserts": ["#DB7093","#FF69B4","#FFB6C1","#FFC0CB"],`;

const newPalettes = `"🍦 Frozen Yogurt": ["#2D1B4E","#8B5CF6","#C084FC","#E9D5FF"],
    "🥤 Smoothies":     ["#831843","#EC4899","#F9A8D4","#FCE7F3"],
    "🍨 Yogulato":      ["#164E63","#06B6D4","#67E8F9","#CFFAFE"],
    "📦 Take Home":     ["#78350F","#F59E0B","#FCD34D","#FEF3C7"],
    "✨ Special":       ["#7F1D1D","#EF4444","#FCA5A5","#FEE2E2"],`;

if (code.includes("🍔 Burgers")) {
  code = code.replace(oldPalettes, newPalettes);
  changes++;
  console.log("✅ FoodImage palettes → Sour Sally colors");
} else if (code.includes("🍦 Frozen Yogurt")) {
  console.log("⏭️  Palettes sudah Sour Sally, skip");
} else {
  // Try a more flexible replacement
  const paletteStart = code.indexOf("const palettes = {");
  if (paletteStart >= 0) {
    const paletteEnd = code.indexOf("};", paletteStart) + 2;
    const newPaletteBlock = `const palettes = {
    "🍦 Frozen Yogurt": ["#2D1B4E","#8B5CF6","#C084FC","#E9D5FF"],
    "🥤 Smoothies":     ["#831843","#EC4899","#F9A8D4","#FCE7F3"],
    "🍨 Yogulato":      ["#164E63","#06B6D4","#67E8F9","#CFFAFE"],
    "📦 Take Home":     ["#78350F","#F59E0B","#FCD34D","#FEF3C7"],
    "✨ Special":       ["#7F1D1D","#EF4444","#FCA5A5","#FEE2E2"],
  }`;
    code = code.slice(0, paletteStart) + newPaletteBlock + code.slice(paletteEnd);
    changes++;
    console.log("✅ FoodImage palettes → Sour Sally colors (flexible match)");
  } else {
    console.warn("⚠️  FoodImage palettes tidak ditemukan, skip");
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. GANTI AddonModal → ToppingPicker
// ═══════════════════════════════════════════════════════════════
const addonModalPattern = /<AddonModal\s+item=\{addonItem\}\s+onClose=\{[^}]*\}\s+onConfirm=\{addToCart\}\s*\/>/;
const addonModalMatch = code.match(addonModalPattern);

if (addonModalMatch) {
  const replacement = `{/* ToppingPicker — Sour Sally froyo topping selector */}
        {addonItem && addonItem.freeToppings > 0 ? (
          <ToppingPicker
            item={addonItem}
            onClose={() => setAddonItem(null)}
            onConfirm={(item, toppings, addonCost) => {
              addToCart(item, toppings, '', addonCost);
              setAddonItem(null);
            }}
          />
        ) : addonItem ? (
          <AddonModal item={addonItem} onClose={() => setAddonItem(null)} onConfirm={addToCart}/>
        ) : null}`;

  code = code.replace(addonModalMatch[0], replacement);
  changes++;
  console.log("✅ AddonModal → ToppingPicker (froyo) + AddonModal fallback (non-froyo)");
} else {
  // Try simpler pattern
  if (code.includes("<AddonModal")) {
    const simplePattern = /<AddonModal[^/]*\/>/;
    const simpleMatch = code.match(simplePattern);
    if (simpleMatch) {
      const replacement = `{addonItem && addonItem.freeToppings > 0 ? (
          <ToppingPicker
            item={addonItem}
            onClose={() => setAddonItem(null)}
            onConfirm={(item, toppings, addonCost) => {
              addToCart(item, toppings, '', addonCost);
              setAddonItem(null);
            }}
          />
        ) : addonItem ? (
          <AddonModal item={addonItem} onClose={() => setAddonItem(null)} onConfirm={addToCart}/>
        ) : null}`;

      code = code.replace(simpleMatch[0], replacement);
      changes++;
      console.log("✅ AddonModal → ToppingPicker (simple match)");
    }
  } else {
    console.warn("⚠️  AddonModal tidak ditemukan, skip");
  }
}

// ═══════════════════════════════════════════════════════════════
// 5. TAMBAH BADGE "🎨 X topping" di menu card (opsional)
// ═══════════════════════════════════════════════════════════════
// Cari tempat dimana item.popular ditampilkan, tambahkan freeToppings badge
if (code.includes("item.popular") && !code.includes("freeToppings")) {
  // Add freeToppings display near popular badge
  const popularPattern = /(\{[^}]*item\.popular[^}]*\})/;
  const popularMatch = code.match(popularPattern);
  if (popularMatch) {
    const after = popularMatch[0] + `
                  {item.freeToppings > 0 && <div style={{position:"absolute",bottom:8,left:8,background:"rgba(139,92,246,0.85)",color:"#fff",padding:"2px 8px",borderRadius:8,fontSize:10,fontWeight:700}}>🎨 {item.freeToppings} topping</div>}`;
    code = code.replace(popularMatch[0], after);
    changes++;
    console.log("✅ Badge '🎨 X topping' ditambahkan di menu card");
  }
}

// ═══════════════════════════════════════════════════════════════
// SAVE
// ═══════════════════════════════════════════════════════════════
if (changes > 0) {
  fs.writeFileSync(KIOSK_PATH, code);
  console.log(`\n🎉 ${changes} perubahan diterapkan ke Kiosk.jsx`);
  console.log("   Backup: Kiosk.jsx.bak");
  console.log("\n   Pastikan file ini ada di ~/bites-kiosk/src/:");
  console.log("   ├── menuData.js");
  console.log("   ├── ToppingPicker.jsx");
  console.log("   └── Kiosk.jsx (sudah di-patch)");
  console.log("\n   Vite HMR auto-reload — buka browser, menu Sour Sally harusnya muncul.");
} else {
  console.log("\n⏭️  Tidak ada perubahan (mungkin sudah di-patch sebelumnya)");
}
