// Simple AI regression test using Playwright.
// Runs multiple auto-demo + AI runs against http://localhost:8000
// and reports how many completed without an AI crash.

const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const RUNS = 10;
  let passes = 0;
  let fails = 0;

  for (let i = 0; i < RUNS; i++) {
    console.log(`Run ${i + 1}/${RUNS}`);

    // Ensure dev flags are set before any app script runs.
    // DEV_SHORT_DEMOS shortens HUMAN_DEMO/HUMAN_DEMO_EXTRA for faster tests.
    await page.addInitScript(() => {
      window.DEV_SHORT_DEMOS = true;
    });

    // Load the page; assumes python3 -m http.server 8000 is already running
    await page.goto('http://localhost:8000/index.html', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });

    // Wait a bit for scripts to initialize
    await page.waitForTimeout(1000);

    // Click the primary button on the overlay (e.g. "Start Practice")
    // Adjust selector if your button text changes.
    const startButton = await page.locator('button.primary-btn').first();
    if (await startButton.isVisible()) {
      await startButton.click();
    }

    // Wait until HUMAN_DEMO starts and completes, then AI_WARMUP/AI_ABLATION begins.
    // gameManager should expose window.__phase and window.__aiCrashed in dev mode.
    await page.waitForFunction(
      () => typeof window.__phase === 'string',
      null,
      { timeout: 15000 }
    );

    // Wait until we enter an AI driving phase.
    await page.waitForFunction(
      () => window.__phase === 'AI_WARMUP' || window.__phase === 'AI_ABLATION',
      null,
      { timeout: 60000 }
    );

    // From here, let AI run for up to 30 seconds, watching for window.__aiCrashed.
    let crashed = false;
    try {
      await page.waitForFunction(
        () => window.__aiCrashed === true,
        null,
        { timeout: 30000 }
      );
      crashed = true;
    } catch {
      crashed = false;
    }

    if (crashed) {
      fails++;
      console.log('  Result: FAIL (AI crashed)');
    } else {
      passes++;
      console.log('  Result: PASS (no crash within 30s AI run)');
    }
  }

  console.log('Summary:', { passes, fails });
  await browser.close();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

