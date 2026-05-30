// server/dayparts.js
//
// Standard daypart definitions untuk dayparting menu auto-switch.
// Menu items boleh di-tag pakai 1+ daypart id; saat current time match,
// item muncul di signage / menu. Item tanpa tag = available all-day.

const DAYPARTS = [
  { id: "breakfast", label: "Sarapan",  emoji: "🥞", start: 5,  end: 10, hint: "Sarapan & morning coffee" },
  { id: "lunch",     label: "Siang",    emoji: "🍽️", start: 10, end: 15, hint: "Makan siang & rice bowl" },
  { id: "snack",     label: "Sore",     emoji: "☕", start: 15, end: 18, hint: "Snack, teh sore, coffee" },
  { id: "dinner",    label: "Malam",    emoji: "🍝", start: 18, end: 22, hint: "Dinner & makan malam" },
  { id: "late",      label: "Larut",    emoji: "🌙", start: 22, end: 5,  hint: "Late night limited menu" },
];

function currentDaypart(now = new Date()) {
  const h = now.getHours();
  for (const dp of DAYPARTS) {
    // Handle wrap-around (late: 22-5)
    if (dp.start > dp.end) {
      if (h >= dp.start || h < dp.end) return dp;
    } else {
      if (h >= dp.start && h < dp.end) return dp;
    }
  }
  return DAYPARTS[1]; // fallback to lunch
}

function currentDaypartId(now) {
  return currentDaypart(now).id;
}

// Filter helper — return true kalau item available di daypart sekarang
function isAvailableNow(itemDayparts, now) {
  if (!itemDayparts) return true; // all-day
  let arr;
  if (typeof itemDayparts === "string") {
    try { arr = JSON.parse(itemDayparts); } catch { return true; }
  } else {
    arr = itemDayparts;
  }
  if (!Array.isArray(arr) || arr.length === 0) return true;
  return arr.includes(currentDaypartId(now));
}

module.exports = { DAYPARTS, currentDaypart, currentDaypartId, isAvailableNow };
