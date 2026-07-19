import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const BASE_URL = process.env.CE_BASE_URL || 'http://127.0.0.1:8080/';
const ARTIFACT_DIR = path.resolve('artifacts');
const SCREENSHOT_DIR = path.join(ARTIFACT_DIR, 'screenshots');
const results = [];

await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

async function waitForScreen(page, screen, timeout = 15_000) {
  await page.waitForFunction((wanted) => window.__ceTest?.ui?.screen === wanted, screen, { timeout });
}

async function status(page) {
  return page.evaluate(() => ({
    screen: window.__ceTest?.ui?.screen || null,
    round: window.__ceTest?.game?.round || null,
    finished: Boolean(window.__ceTest?.game?.finished),
    companyCount: window.__ceTest?.game?.companies?.length || 0,
    winnerId: window.__ceTest?.game?.winnerId || null,
  }));
}

async function gameSnapshot(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__ceTest.game)));
}

async function openClean(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('#panels');
  await page.waitForFunction(() => Boolean(window.__ceTest));
  assert(page.url().includes('/ui/hotseat.html'), `Root entry did not redirect to hotseat UI: ${page.url()}`);
  assert(await page.locator('canvas').count() === 1, 'Expected exactly one Three.js canvas');
  assert(await page.getByRole('button', { name: 'Start Match' }).isVisible(), 'Start Match is not visible from a clean state');
}

async function chooseFirstLegalHq(page) {
  await waitForScreen(page, 'hq');
  const clicked = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#panels .stack .card')];
    const card = cards.find((node) => !node.textContent.includes('Taken'));
    if (!card) return false;
    card.click();
    return true;
  });
  assert(clicked, 'No legal HQ card was available');
  await page.getByRole('button', { name: 'Confirm HQ Location' }).click();
  await waitForScreen(page, 'planning');
}

async function beginCurrentHuman(page) {
  await waitForScreen(page, 'transition');
  const button = page.getByRole('button', { name: /Begin Turn$/ });
  assert(await button.isVisible(), 'Pass-device Begin Turn button is not visible');
  await button.click();
  const next = (await status(page)).screen;
  if (next === 'hq') await chooseFirstLegalHq(page);
  else assert(next === 'planning', `Unexpected screen after Begin Turn: ${next}`);
}

async function submitCurrentHuman(page) {
  await waitForScreen(page, 'planning');
  const review = page.getByRole('button', { name: /Review & (Pass to Next Company|Resolve Round)/ });
  assert(await review.isVisible(), 'Planning review/submit control is not visible');
  await review.click();
  const submit = page.getByRole('button', { name: /Submit & (Pass Device|Resolve)/ });
  assert(await submit.isVisible(), 'Submit confirmation control is not visible');
  await submit.click();
}

async function skipSellingThroughUi(page, verifyControls = false) {
  await waitForScreen(page, 'selling');
  if (verifyControls) {
    for (const speed of [1, 2, 4]) {
      await page.getByRole('button', { name: `x${speed}`, exact: true }).click();
      const actual = await page.evaluate(() => window.__ceTest.ui.speed);
      assert(actual === speed, `Selling speed x${speed} did not update UI playback speed`);
    }
  }
  const before = hash(await gameSnapshot(page));
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  const after = hash(await gameSnapshot(page));
  assert(before === after, 'Replay Skip mutated authoritative game state');
  const continueButton = page.getByRole('button', { name: 'Continue to Round Summary' });
  assert(await continueButton.isEnabled(), 'Replay did not finish after Skip');
  await continueButton.click();
  await waitForScreen(page, 'summary');
}

async function advanceSummary(page) {
  await waitForScreen(page, 'summary');
  const button = page.getByRole('button', { name: /^(Next Round|See Match Results)$/ });
  assert(await button.isVisible(), 'Summary continuation button is missing');
  await button.click();
}

async function driveMixedMatchToVictory(page, { verifySellingControls = false, privacyCheck = null, maxSteps = 300 } = {}) {
  let controlsChecked = false;
  let transitionCount = 0;
  for (let step = 0; step < maxSteps; step++) {
    const current = await status(page);
    if (current.screen === 'victory') return gameSnapshot(page);
    if (current.screen === 'transition') {
      transitionCount++;
      if (privacyCheck) await privacyCheck({ page, transitionCount });
      await beginCurrentHuman(page);
      continue;
    }
    if (current.screen === 'hq') {
      await chooseFirstLegalHq(page);
      continue;
    }
    if (current.screen === 'planning') {
      await submitCurrentHuman(page);
      continue;
    }
    if (current.screen === 'selling') {
      await skipSellingThroughUi(page, verifySellingControls && !controlsChecked);
      controlsChecked = true;
      continue;
    }
    if (current.screen === 'summary') {
      await advanceSummary(page);
      continue;
    }
    throw new Error(`Mixed match reached unexpected screen: ${current.screen}`);
  }
  throw new Error(`Mixed match did not reach victory within ${maxSteps} UI steps`);
}

async function driveAllBotToVictory(page, maxSteps = 120) {
  for (let step = 0; step < maxSteps; step++) {
    const current = await status(page);
    if (current.screen === 'victory') return gameSnapshot(page);
    if (current.screen === 'selling') {
      await page.evaluate(() => {
        window.__ceTest.skipReplay();
        window.__ceTest.goToSummary();
      });
      continue;
    }
    if (current.screen === 'summary') {
      await page.evaluate(() => window.__ceTest.proceedAfterSummary());
      continue;
    }
    throw new Error(`All-bot match reached unexpected screen: ${current.screen}`);
  }
  throw new Error(`All-bot match did not reach victory within ${maxSteps} accelerated steps`);
}

function botConfig(count, seed) {
  const ids = ['balanced_operator', 'price_leader', 'brand_builder', 'retail_expansion'];
  return {
    seed,
    slots: Array.from({ length: count }, (_, i) => ({
      type: 'bot',
      name: `Audit Bot ${i + 1}`,
      archetype: ids[i % ids.length],
    })),
  };
}

async function runScenario(browser, name, viewport, fn) {
  const started = Date.now();
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.stack || error.message}`));
  page.on('requestfailed', (request) => runtimeErrors.push(`requestfailed: ${request.url()} — ${request.failure()?.errorText || 'unknown'}`));

  try {
    const details = await fn(page);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
    assert(runtimeErrors.length === 0, `${name} produced browser/runtime errors:\n${runtimeErrors.join('\n')}`);
    const record = { name, status: 'PASS', durationMs: Date.now() - started, viewport, details };
    results.push(record);
    console.log(`PASS ${name} (${record.durationMs}ms)`);
  } catch (error) {
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}-FAILED.png`), fullPage: true }).catch(() => {});
    const record = { name, status: 'FAIL', durationMs: Date.now() - started, viewport, error: error.stack || String(error), runtimeErrors };
    results.push(record);
    console.error(`FAIL ${name}\n${record.error}`);
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-webgl', '--disable-dev-shm-usage', '--no-sandbox'],
});

let fatal = null;
try {
  await runScenario(browser, 'entry-and-viewports', { width: 1280, height: 800 }, async (page) => {
    await openClean(page);
    const viewports = [
      { width: 1024, height: 768, label: 'tablet-like' },
      { width: 390, height: 844, label: 'mobile-portrait-emulation' },
      { width: 844, height: 390, label: 'mobile-landscape-emulation' },
    ];
    const checks = [];
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(50);
      const measurement = await page.evaluate(() => ({
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        startVisible: Boolean([...document.querySelectorAll('button')].find((b) => b.textContent === 'Start Match')?.offsetParent),
        canvasCount: document.querySelectorAll('canvas').length,
      }));
      assert(measurement.startVisible, `${vp.label}: Start Match became invisible`);
      assert(measurement.canvasCount === 1, `${vp.label}: canvas count changed`);
      assert(measurement.scrollWidth <= measurement.innerWidth + 2, `${vp.label}: horizontal page overflow ${measurement.scrollWidth} > ${measurement.innerWidth}`);
      checks.push({ ...vp, ...measurement });
    }
    return { checks, realDevice: false };
  });

  await runScenario(browser, 'human-vs-bot-save-resume-victory-restart', { width: 1280, height: 800 }, async (page) => {
    await openClean(page);
    await page.getByRole('button', { name: 'Start Match' }).click();
    await beginCurrentHuman(page);
    await submitCurrentHuman(page);
    await skipSellingThroughUi(page, true);

    const beforeReload = await gameSnapshot(page);
    const savedCompanies = beforeReload.companies.map((c) => ({ id: c.id, cash: c.cash, cumulativeRevenue: c.cumulativeRevenue, unitsSoldTotal: c.unitsSoldTotal }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__ceTest));
    assert(await page.getByRole('button', { name: 'Resume' }).isVisible(), 'Round-boundary save was not offered after reload');
    await page.getByRole('button', { name: 'Resume' }).click();
    const afterResumeCompanies = await page.evaluate(() => window.__ceTest.game.companies.map((c) => ({ id: c.id, cash: c.cash, cumulativeRevenue: c.cumulativeRevenue, unitsSoldTotal: c.unitsSoldTotal })));
    assert(JSON.stringify(savedCompanies) === JSON.stringify(afterResumeCompanies), 'Save/Resume changed cash, revenue, or units sold');

    const final = await driveMixedMatchToVictory(page);
    assert(final.finished && final.winnerId, 'Human vs Bot did not produce a winner');
    const rounds = final.round;
    await page.getByRole('button', { name: 'New Match' }).click();
    await page.waitForFunction(() => window.__ceTest.ui.screen === 'setup');
    assert(!(await page.getByText(/Saved match/).count()), 'New Match retained the previous save');
    return { rounds, winnerId: final.winnerId, saveResume: true, speedControls: ['x1', 'x2', 'x4', 'Skip'], restartClean: true };
  });

  await runScenario(browser, 'human-plus-three-bots-full-match', { width: 1280, height: 800 }, async (page) => {
    await openClean(page);
    const config = {
      seed: 20260720,
      slots: [
        { type: 'human', name: 'Audit Human', archetype: 'balanced_operator' },
        { type: 'bot', name: 'Price Bot', archetype: 'price_leader' },
        { type: 'bot', name: 'Brand Bot', archetype: 'brand_builder' },
        { type: 'bot', name: 'Retail Bot', archetype: 'retail_expansion' },
      ],
    };
    await page.evaluate((cfg) => window.__ceTest.startMatch(cfg), config);
    const final = await driveMixedMatchToVictory(page);
    assert(final.companies.length === 4, 'Human + 3 Bots lost a company slot');
    return { rounds: final.round, winnerId: final.winnerId, companies: final.companies.length };
  });

  await runScenario(browser, 'two-human-hotseat-full-match-privacy', { width: 1280, height: 800 }, async (page) => {
    await openClean(page);
    const secondRow = page.locator('#panels .stack > .row').nth(1);
    await secondRow.locator('select').first().selectOption('human');
    await page.getByRole('button', { name: 'Start Match' }).click();

    const privacyCheck = async ({ page: currentPage, transitionCount }) => {
      if (transitionCount < 2) return;
      assert(await currentPage.locator('#planDock').count() === 0, 'Pass-device screen leaked previous planning controls');
      assert(await currentPage.getByText('Campaigns queued:').count() === 0, 'Pass-device screen leaked pending campaign count');
      assert(await currentPage.getByText('Shipments queued:').count() === 0, 'Pass-device screen leaked pending shipment count');
      const devHidden = await currentPage.locator('#devPanel').evaluate((node) => node.classList.contains('hidden'));
      assert(devHidden, 'Dev panel was visible during normal hot-seat play');
    };

    const final = await driveMixedMatchToVictory(page, { privacyCheck, maxSteps: 500 });
    assert(final.companies.length === 2, 'Two-human match changed company count');
    return { rounds: final.round, winnerId: final.winnerId, privacyTransitionsChecked: true };
  });

  const deterministicFinals = [];
  for (const count of [2, 3, 4]) {
    await runScenario(browser, `all-bot-${count}-company-full-match`, { width: 1280, height: 800 }, async (page) => {
      await openClean(page);
      const config = botConfig(count, 4400 + count);
      await page.evaluate((cfg) => window.__ceTest.startMatch(cfg), config);
      const final = await driveAllBotToVictory(page);
      assert(final.finished && final.winnerId, `${count}-company all-bot match did not finish`);
      assert(final.companies.length === count, `${count}-company all-bot match changed company count`);
      if (count === 4) deterministicFinals.push(hash(final));
      return { rounds: final.round, winnerId: final.winnerId, companies: count, finalHash: hash(final) };
    });
  }

  await runScenario(browser, 'four-bot-determinism-and-lifecycle-smoke', { width: 1280, height: 800 }, async (page) => {
    await openClean(page);
    const nodeCounts = [];
    const hashes = [];
    for (let i = 0; i < 3; i++) {
      const config = botConfig(4, 4404);
      await page.evaluate((cfg) => window.__ceTest.startMatch(cfg), config);
      const final = await driveAllBotToVictory(page);
      hashes.push(hash(final));
      nodeCounts.push(await page.locator('*').count());
      assert(await page.locator('canvas').count() === 1, `Lifecycle run ${i + 1} duplicated the canvas`);
    }
    assert(new Set(hashes).size === 1, `Same seed/config produced different final states: ${hashes.join(', ')}`);
    assert(Math.max(...nodeCounts) - Math.min(...nodeCounts) <= 20, `DOM node count grew across repeated matches: ${nodeCounts.join(', ')}`);
    return { hashes, nodeCounts, deterministic: true };
  });
} catch (error) {
  fatal = error;
} finally {
  await browser.close();
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    result: fatal ? 'FAIL' : 'PASS',
    scenarios: results,
    limitations: ['Mobile checks are viewport emulation only; no real mobile device was available in GitHub Actions.'],
  };
  await fs.writeFile(path.join(ARTIFACT_DIR, 'coco-browser-audit-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (fatal) throw fatal;
