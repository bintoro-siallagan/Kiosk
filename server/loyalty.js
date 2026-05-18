// ═══════════════════════════════════════════════════════════════
// Loyalty Points — earn on completed, auto-redeem on create
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, "loyalty-config.json");

function loadConfig() {
  const defaults = {
    enabled:          true,
    earnRate:         1000,  // 1 point per Rp X spent
    redeemRate:       100,   // X points = Rp 1.000 discount
    minRedeemPoints:  100,
    maxRedeemPercent: 50,    // max % of order total
  };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) };
    }
  } catch (e) { console.warn("loyalty-config.json corrupt:", e.message); }
  return defaults;
}

let config = loadConfig();

function saveConfig() { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); }

function calculateEarned(orderTotal) {
  if (!config.enabled || !config.earnRate) return 0;
  return Math.floor(orderTotal / config.earnRate);
}

// returns { points, discount } — points to deduct, discount in IDR
function calculateAutoRedeem(customerPoints, orderTotal) {
  if (!config.enabled) return { points: 0, discount: 0 };
  if (customerPoints < config.minRedeemPoints) return { points: 0, discount: 0 };
  const maxDiscountFromPercent = Math.floor(orderTotal * config.maxRedeemPercent / 100);
  const maxDiscountFromPoints  = Math.floor(customerPoints / config.redeemRate) * 1000;
  const discount = Math.min(maxDiscountFromPercent, maxDiscountFromPoints);
  const points   = Math.floor(discount / 1000) * config.redeemRate;
  return { points, discount };
}

module.exports = {
  getConfig: () => config,
  setConfig: (patch) => {
    Object.keys(patch).forEach(k => { if (config[k] !== undefined) config[k] = patch[k]; });
    saveConfig();
    return config;
  },
  calculateEarned,
  calculateAutoRedeem,
};
