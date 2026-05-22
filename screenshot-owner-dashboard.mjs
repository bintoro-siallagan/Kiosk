// screenshot-owner-dashboard.mjs
// Capture + smoke-test the Owner Dashboard tab inside AdminTools.
// Seeds a real admin session into localStorage, opens ?tools (default tab = dashboard).
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, 'screenshots');
const URL = 'http://localhost:5184/bites-kiosk/?tools';
const SESSION = { token: 'q5twhvchsahmpg7ilwk', role: 'manager', name: 'Manager' };

const seed = (s) => {
  localStorage.setItem('adminToken', s.token);
  localStorage.setItem('adminRole', s.role);
  localStorage.setItem('adminName', s.name);
};

const measureDash = () => {
  const h1 = [...document.querySelectorAll('h1')].find(e => e.textContent.trim() === 'Owner Dashboard');
  if (!h1) return null;
  return h1.parentElement.parentElement.parentElement.scrollHeight;
};

async function openDash(ctx) {
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('h1:has-text("Owner Dashboard")', { timeout: 15000 });
  await page.waitForTimeout(3500);
  return page;
}

async function fitAndShot(page, w, file) {
  const h = await page.evaluate(measureDash);
  await page.setViewportSize({ width: w, height: Math.min((h || 1400) + 60, 14000) });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, file) });
  return h;
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];

  // ── 1. DESKTOP — default (today) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1400 } });
    await ctx.addInitScript(seed, SESSION);
    const page = await openDash(ctx);
    const h = await fitAndShot(page, 1920, 'owner-dashboard-desktop.png');
    const nan = await page.evaluate(() => document.body.innerText.includes('NaN'));
    report.push(`desktop/today: captured (${h}px), NaN present=${nan}`);
    await ctx.close();
  }

  // ── 2. DESKTOP — MTD (populated period) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1400 } });
    await ctx.addInitScript(seed, SESSION);
    const page = await openDash(ctx);
    await page.click('button:has-text("MTD")');
    await page.waitForTimeout(3000);
    const h = await fitAndShot(page, 1920, 'owner-dashboard-desktop-mtd.png');
    const empties = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div').forEach(d => {
        const t = (d.textContent || '').trim();
        if (/^Belum ada/.test(t) && t.length < 70 && d.children.length === 0) out.push(t);
      });
      return [...new Set(out)];
    });
    report.push(`desktop/MTD: captured (${h}px)`);
    report.push(`empty panels @MTD (${empties.length}): ${empties.join(' || ') || 'none'}`);
    await ctx.close();
  }

  // ── 3. MOBILE — default (~400px) ──
  {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(seed, SESSION);
    const page = await openDash(ctx);
    const h = await fitAndShot(page, 412, 'owner-dashboard-mobile.png');
    // verify grid collapsed: hero cards stacked => each card width ~ full content width
    const cols = await page.evaluate(() => {
      const grid = document.querySelector('.grid-2');
      if (!grid) return 'no .grid-2';
      return getComputedStyle(grid).gridTemplateColumns;
    });
    report.push(`mobile: captured (${h}px), .grid-2 columns="${cols}"`);
    await ctx.close();
  }

  // ── 4. INTERACTION smoke test ──
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1400 } });
    await ctx.addInitScript(seed, SESSION);
    const page = await openDash(ctx);

    // period button
    await page.click('button:has-text("Kemarin")');
    await page.waitForTimeout(2500);
    const sub = await page.evaluate(() => {
      const h1 = [...document.querySelectorAll('h1')].find(e => e.textContent.trim() === 'Owner Dashboard');
      return h1?.parentElement?.querySelector('div')?.textContent || '';
    });
    report.push(`period 'Kemarin': subtitle="${sub.slice(0, 32)}" -> ${sub.includes('Kemarin') ? 'OK' : 'FAIL'}`);

    // print media — .no-print elements (AdminTools header + sidebar) must be display:none
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(300);
    const printChk = await page.evaluate(() => {
      const np = [...document.querySelectorAll('.no-print')];
      const hidden = np.filter(el => getComputedStyle(el).display === 'none').length;
      const dashVisible = !![...document.querySelectorAll('h1')]
        .find(e => e.textContent.trim() === 'Owner Dashboard' && e.offsetParent !== null);
      return { total: np.length, hidden, dashVisible };
    });
    await page.screenshot({ path: join(OUT, 'owner-dashboard-print.png') });
    report.push(`print: ${printChk.hidden}/${printChk.total} .no-print hidden, dashboard visible=${printChk.dashVisible}`);
    await page.emulateMedia({ media: 'screen' });

    // drill-down: KPI 'Net Revenue' -> Finance tab
    await page.click('text=Net Revenue');
    await page.waitForTimeout(1500);
    const leftDash = await page.evaluate(() =>
      ![...document.querySelectorAll('h1')].find(e => e.textContent.trim() === 'Owner Dashboard'));
    report.push(`drill-down 'Net Revenue' KPI -> ${leftDash ? 'OK (navigated to Finance)' : 'FAIL'}`);
    await ctx.close();
  }

  await browser.close();
  console.log('\n──── REPORT ────');
  report.forEach(r => console.log('• ' + r));
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
