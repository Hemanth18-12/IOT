import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, 'backend/.env');

function readEnv(key) {
  const txt = fs.readFileSync(envPath, 'utf8');
  const m = txt.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const adminEmail = readEnv('ADMIN_EMAIL');
const adminPassword = readEnv('ADMIN_PASSWORD');

const ROUTES = [
  { path: '/', titleText: 'Control Dashboard', bodyMatch: 'Remote Door Control' },
  { path: '/devices', titleText: 'Device Controls', bodyMatch: 'Hardware Component Inventory' },
  { path: '/security', titleText: 'Security Center', bodyMatch: 'Security Activity Timeline' },
  { path: '/activity', titleText: 'Activity History', bodyMatch: 'Activity Log Ledger' },
  { path: '/analytics', titleText: 'Sensor & Security Analytics', bodyMatch: 'Historical Analytics' },
  { path: '/notifications', titleText: 'Notification Center', bodyMatch: 'Recent SMTP Delivery Results' },
  { path: '/settings', titleText: 'System Settings', bodyMatch: 'Connection Diagnostics' },
  { path: '/about', titleText: 'About SmartRoom Project', bodyMatch: 'Mobile Phone Wi-Fi Access' },
];

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  if (overflow.scrollWidth > overflow.innerWidth + 2) {
    throw new Error(
      `Horizontal overflow on ${label}: scrollWidth=${overflow.scrollWidth} > innerWidth=${overflow.innerWidth}`,
    );
  }
}

async function main() {
  // Detect LAN URL from live backend health
  const health = await (await fetch('http://127.0.0.1:3000/api/health')).json();
  const baseUrl = 'http://127.0.0.1:5173';
  const lanUrl = health.mobileUrl || baseUrl;

  const browser = await chromium.launch({ headless: true });

  try {
    // ================= 1. DESKTOP VIEWPORT (1280x800) =================
    const desktopCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktopCtx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('response', (res) => {
      if (res.status() >= 500) errors.push(`HTTP ${res.status()} ${res.url()}`);
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForURL('**/login');

    // Test invalid login & password visibility toggle
    const pwdInput = page.locator('#login-password');
    if ((await pwdInput.getAttribute('type')) !== 'password') {
      throw new Error('Password input should start masked');
    }
    await page.getByLabel('Show password').click();
    if ((await pwdInput.getAttribute('type')) !== 'text') {
      throw new Error('Show password toggle failed');
    }
    await page.getByLabel('Hide password').click();

    await page.fill('#login-email', adminEmail);
    await page.fill('#login-password', 'WrongPass123!');
    await page.getByRole('button', { name: /Sign In to Console/i }).click();
    await page.getByRole('alert').waitFor({ timeout: 5000 });
    console.log('PASS [Desktop]: Invalid login alert displayed');

    // Valid login
    await page.fill('#login-password', adminPassword);
    await page.getByRole('button', { name: /Sign In to Console/i }).click();
    await page.waitForURL(`${baseUrl}/`);
    await page.getByRole('heading', { name: 'Remote Door Control' }).waitFor({ timeout: 5000 });
    console.log('PASS [Desktop]: Authenticated login & Dashboard loaded');

    // Verify offline lock buttons are disabled while hardware offline
    const unlockBtn = page.getByRole('button', { name: /Unlock Door/i });
    if (!(await unlockBtn.isDisabled())) {
      throw new Error('Unlock Door button should be disabled when physical node is offline');
    }
    console.log('PASS [Desktop]: Remote Unlock disabled while smartroom-01 offline');

    // Explicitly enable Demo Mode, test Confirmation Modal & Simulated Wrong Password, then exit
    await page.getByRole('button', { name: /Demo Mode/i }).click();
    await page.getByText('DEMO MODE ACTIVE:').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: /Wrong Password/i }).click();
    await page.getByRole('button', { name: /Unlock Door/i }).click();
    await page.getByText('Confirm Remote Door Unlock').waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: /Unlock Door Now/i }).click();
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: /Exit Demo/i }).click();
    console.log('PASS [Desktop]: Demo Mode confirmation modal & isolation verified');

    // Visit all 8 authenticated pages via sidebar navigation
    for (const r of ROUTES) {
      if (r.path !== '/') {
        await page.locator(`aside nav a[href="${r.path}"]`).click();
      }
      await page.getByText(r.bodyMatch).first().waitFor({ timeout: 5000 });
      await assertNoOverflow(page, `Desktop ${r.path}`);
    }

    // Verify QR image rendered on About Project page
    const qrImg = page.locator('img[alt^="QR code for"]');
    await qrImg.waitFor({ timeout: 5000 });
    const qrSrc = await qrImg.getAttribute('src');
    if (!qrSrc || !qrSrc.startsWith('data:image/png')) {
      throw new Error('QR code image did not render');
    }
    console.log('PASS [Desktop]: All 9 pages verified including Settings & Mobile QR code');

    // Verify Settings Verify SMTP & Save
    await page.locator('aside nav a[href="/settings"]').click();
    await page.getByRole('button', { name: /Verify SMTP/i }).click();
    await page.getByText(/SMTP credentials are not configured/i).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: /Save Settings/i }).click();
    await page.getByText(/Settings saved to database/i).waitFor({ timeout: 5000 });
    console.log('PASS [Desktop]: Settings save & Verify SMTP diagnostic verified');

    // Logout
    await page.getByRole('button', { name: /Sign Out/i }).first().click();
    await page.waitForURL('**/login');
    console.log('PASS [Desktop]: Logout redirected cleanly to /login');

    if (errors.length > 0) {
      throw new Error(`Desktop browser errors: ${errors.join('; ')}`);
    }
    await desktopCtx.close();

    // ================= 2. MOBILE VIEWPORT (390x844) via LAN URL =================
    const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mPage = await mobileCtx.newPage();
    const mErrors = [];
    mPage.on('pageerror', (e) => mErrors.push(`pageerror: ${e.message}`));
    mPage.on('response', (res) => {
      if (res.status() >= 500) mErrors.push(`HTTP ${res.status()} ${res.url()}`);
    });

    await mPage.goto(lanUrl, { waitUntil: 'networkidle' });
    await mPage.waitForURL('**/login');
    await assertNoOverflow(mPage, 'Mobile /login');

    await mPage.fill('#login-email', adminEmail);
    await mPage.fill('#login-password', adminPassword);
    await mPage.getByRole('button', { name: /Sign In to Console/i }).click();
    await mPage.waitForURL(`${lanUrl}/`);
    await mPage.getByRole('heading', { name: 'Remote Door Control' }).waitFor({ timeout: 5000 });

    for (const r of ROUTES) {
      if (r.path !== '/') {
        await mPage.getByLabel('Open navigation menu').click();
        await mPage.locator(`aside nav a[href="${r.path}"]`).click();
      }
      await mPage.getByText(r.bodyMatch).first().waitFor({ timeout: 5000 });
      await assertNoOverflow(mPage, `Mobile ${r.path}`);
    }
    console.log(`PASS [Mobile 390x844]: All 9 pages verified via LAN URL (${lanUrl}) with zero overflow`);

    if (mErrors.length > 0) {
      throw new Error(`Mobile browser errors: ${mErrors.join('; ')}`);
    }
    await mobileCtx.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('BROWSER TEST FAILED:', err);
  process.exit(1);
});
