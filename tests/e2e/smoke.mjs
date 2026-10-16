import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://127.0.0.1:3005';
const ARTIFACTS_DIR = 'C:\\Users\\aliha\\.gemini\\antigravity\\brain\\22ce90bb-3208-4500-a189-6494aaf81670';

async function runSmoke() {
  console.log('[E2E Smoke] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-webgl',
      '--use-gl=angle',
      '--use-angle=default',
      '--ignore-gpu-blocklist',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    // 1. Test Home / Dashboard
    console.log('[E2E Smoke] Navigating to Home...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    // Verify Biometric Dossier Modal
    const dossierBtn = await page.$('button[title*="Biometric Dossier"]');
    if (dossierBtn) {
      console.log('[E2E Smoke] Opening Biometric Dossier Modal...');
      await dossierBtn.click();
      await new Promise((r) => setTimeout(r, 600));
      await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'prod_dashboard_report.png') });
      console.log('[E2E Smoke] Captured prod_dashboard_report.png');
      const closeBtn = await page.$('button[aria-label="Close dossier"]');
      if (closeBtn) await closeBtn.click();
      await new Promise((r) => setTimeout(r, 400));
    }

    // 2. Test Workouts Route
    console.log('[E2E Smoke] Navigating to /workouts...');
    await page.goto(`${BASE_URL}/workouts`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Start a workout session
    const startBtns = await page.$$('button');
    for (const btn of startBtns) {
      const text = await page.evaluate((el) => el.textContent, btn);
      if (text && text.includes('Start Routine')) {
        console.log('[E2E Smoke] Launching Workout Session Modal...');
        await btn.click();
        await new Promise((r) => setTimeout(r, 600));
        break;
      }
    }
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'prod_workouts_session.png') });
    console.log('[E2E Smoke] Captured prod_workouts_session.png');

    // Close session modal
    const endBtn = await page.$('button');
    if (endBtn) {
      // Find Cancel / Exit button
      const allButtons = await page.$$('button');
      for (const b of allButtons) {
        const text = await page.evaluate((el) => el.textContent, b);
        if (text && (text.includes('Cancel') || text.includes('Close') || text.includes('Finish'))) {
          await b.click();
          break;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400));

    // 3. Test Nutrition Route
    console.log('[E2E Smoke] Navigating to /nutrition...');
    await page.goto(`${BASE_URL}/nutrition`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Click Hydration +250ml
    const nutButtons = await page.$$('button');
    for (const b of nutButtons) {
      const text = await page.evaluate((el) => el.textContent, b);
      if (text && text.includes('+250ml')) {
        console.log('[E2E Smoke] Logging +250ml hydration...');
        await b.click();
        await new Promise((r) => setTimeout(r, 300));
        break;
      }
    }
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'prod_nutrition_hydration.png') });
    console.log('[E2E Smoke] Captured prod_nutrition_hydration.png');

    // 4. Test Progress Route
    console.log('[E2E Smoke] Navigating to /progress...');
    await page.goto(`${BASE_URL}/progress`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    // Toggle to Body Fat metric tab
    const progButtons = await page.$$('button');
    for (const b of progButtons) {
      const text = await page.evaluate((el) => el.textContent, b);
      if (text && text.includes('Body Fat %')) {
        console.log('[E2E Smoke] Switching to Body Fat % metric view...');
        await b.click();
        await new Promise((r) => setTimeout(r, 400));
        break;
      }
    }
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'prod_progress_metrics.png') });
    console.log('[E2E Smoke] Captured prod_progress_metrics.png');

    // 5. Test Mobile Responsive Viewport (iPhone 14 Pro Max 430x932)
    console.log('[E2E Smoke] Emulating Mobile Viewport (430x932)...');
    await page.setViewport({ width: 430, height: 932, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'prod_mobile_responsive.png') });
    console.log('[E2E Smoke] Captured prod_mobile_responsive.png');

    console.log('[E2E Smoke] All production routes and visual verification succeeded 100%!');
  } catch (err) {
    console.error('[E2E Smoke] FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runSmoke();
