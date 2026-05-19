// screenshot-kiosk.mjs
// Capture Bites Kiosk flow pages across kiosk viewports.
//
// Setup (one-time, dari ~/bites-kiosk):
//   npm install -D playwright
//   npx playwright install chromium
//
// Run (pastikan frontend hidup di port 5184):
//   node screenshot-kiosk.mjs                     # default routes
//   node screenshot-kiosk.mjs "/?flow=1&table=T05" # custom route
//   KIOSK_URL=http://192.168.1.50:5184 node screenshot-kiosk.mjs
//   HEADED=1 node screenshot-kiosk.mjs            # liat browsernya

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR  = join(__dirname, 'screenshots');
const BASE_URL = process.env.KIOSK_URL || 'http://localhost:5184';
const HEADED   = process.env.HEADED === '1';

// Routes — kalau argv ada, pakai itu; kalau ngga, default list
const ROUTES = process.argv[2]
  ? [{ name: 'custom', path: process.argv[2] }]
  : [
      { name: 'flow-menu-T01', path: '/?flow=1&table=T01' },
      // tambahin route lain di sini kalau perlu, ex:
      // { name: 'flow-cart-T01', path: '/?flow=1&table=T01&step=cart' },
    ];

// Kiosk umum dipasang di tablet landscape / monitor 1080p
const VIEWPORTS = [
  { name: 'desktop-1920x1080', width: 1920, height: 1080 },
  { name: 'tablet-1280x800',   width: 1280, height: 800  },
];

const ts = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: !HEADED });
  const stamp = ts();

  let ok = 0, fail = 0;
  for (const route of ROUTES) {
    for (const vp of VIEWPORTS) {
      const ctx  = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const url  = BASE_URL + route.path;
      const tag  = `${route.name} @ ${vp.name}`;
      process.stdout.write(`→ ${tag.padEnd(40)} `);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
        await page.waitForTimeout(600); // settle animations / late hydration
        const file = join(OUT_DIR, `${stamp}_${route.name}_${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`✓ ${file.replace(__dirname + '/', '')}`);
        ok++;
      } catch (err) {
        console.log(`✗ ${err.message.split('\n')[0]}`);
        fail++;
      } finally {
        await ctx.close();
      }
    }
  }

  await browser.close();
  console.log(`\nDone. ${ok} ok, ${fail} failed. Output: ${OUT_DIR}`);
  process.exit(fail ? 1 : 0);
})();
