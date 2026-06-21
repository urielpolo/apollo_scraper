const { chromium } = require('playwright');
const fs = require('fs');

const CONFIG = {
  sessionFile: 'apollo-session.json',
  loginTimeoutMs: 60_000,
  maxFailures: 5,
  cooldownMs: 30 * 60 * 1000,
  retryDelayMs: 5_000,
  postReloadWaitMs: 10_000,
  progressPollMs: 5_000,
  progressTimeoutMs: 300_000,
  recheckWaitMs: 60_000,
  maxRecheckAttempts: 20,
  modalCloseDelayMs: 1_200,
  escCloseDelayMs: 800,
  postClickDelayMs: 1_500,
  postApplyDelayMs: 3_000,
  logFile: `run-${Date.now()}.log`,
};

let _onLog = null;
let _onExported = null;
let _maxLeads = Infinity;
let _logStream = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  if (_logStream) _logStream.write(line + '\n');
  if (_onLog) _onLog(line);
}

async function closeModalIfPresent(page) {
  try {
    const modal = await page.$('[role="dialog"]');
    if (!modal) return;
    log('⚠️ Modal detected... closing');
    const closeBtn =
      await page.$('button:has-text("Close")') ||
      await page.$('button:has-text("Cancel")') ||
      await page.$('button:has-text("Got it")') ||
      await page.$('[aria-label="Close"]');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(CONFIG.modalCloseDelayMs);
      log('✅ Modal closed');
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(CONFIG.escCloseDelayMs);
      log('⌨️ Esc pressed');
    }
  } catch (e) {
    log(`⚠️ closeModalIfPresent error (ignored): ${e.message}`);
  }
}

async function getResultCount(page) {
  try {
    const text = await page.textContent('body');
    if (!text) return null;
    const match =
      text.match(/([\d,]+)\s*net new/i) ||
      text.match(/net new.*?([\d,]+)/i);
    return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
  } catch {
    return null;
  }
}

async function isLoggedIn(page) {
  try {
    await page.waitForSelector('[data-testid="nav-bar"], nav[aria-label="Main"], .zp-navbar', {
      timeout: 8_000,
    });
    return true;
  } catch {
    return false;
  }
}

async function detectLimit(page) {
  try {
    const text = await page.textContent('body');
    if (!text) return false;
    const signals = ['limit reached', 'upgrade', 'not enough credits', 'export limit'];
    return signals.some(s => text.toLowerCase().includes(s));
  } catch {
    return false;
  }
}

async function waitForProgressToFinish(page) {
  log('👀 Waiting for progress bar to appear...');
  let barAppeared = false;
  for (let i = 0; i < 6; i++) {
    const exists = await page.$('.zp_LZQBk').catch(() => null);
    if (exists) {
      barAppeared = true;
      log('✅ Progress bar appeared — watching for 100%...');
      break;
    }
    await page.waitForTimeout(3_000);
  }
  if (!barAppeared) {
    log('ℹ️ No progress bar detected — continuing');
    return;
  }
  const start = Date.now();
  while (Date.now() - start < CONFIG.progressTimeoutMs) {
    await page.waitForTimeout(CONFIG.progressPollMs);
    const width = await page.evaluate(() => {
      const bar = document.querySelector('.zp_LZQBk');
      if (!bar) return null;
      return bar.style.width;
    });
    log(`⏳ Progress bar width: ${width}`);
    if (width === null) {
      log('✅ Progress bar gone — export complete');
      return;
    }
    if (width === '100%') {
      log('✅ Progress bar at 100% — clicking X to dismiss...');
      await page.evaluate(() => {
        const icons = [...document.querySelectorAll('i.apollo-icon-times')];
        icons.forEach(icon => {
          const target = icon.closest('button') || icon.parentElement || icon;
          target.click();
        });
      });
      await page.waitForTimeout(500);
      log('✅ Toast dismissed');
      return;
    }
  }
  log('⚠️ Timed out waiting for 100% — continuing anyway');
}

async function switchToNewTab(context, oldPage, searchUrl) {
  log(`🆕 Opening new tab: ${searchUrl}`);
  const newPage = await context.newPage();
  await newPage.bringToFront();
  await newPage.goto(searchUrl, { waitUntil: 'domcontentloaded' });
  await newPage.waitForTimeout(CONFIG.postReloadWaitMs);
  await closeModalIfPresent(newPage);
  try { await oldPage.close(); } catch {}
  log('🗂️ Old tab closed — now working in new tab');
  return newPage;
}

async function waitForCountToDrop(page, before, searchUrl) {
  log(`⏳ Waiting for net new to drop below ${before}...`);
  for (let attempt = 1; attempt <= CONFIG.maxRecheckAttempts; attempt++) {
    const after = await getResultCount(page);
    log(`📉 Count check (${attempt}/${CONFIG.maxRecheckAttempts}): ${after} (was ${before})`);
    if (after !== null && after < before) {
      log(`✅ Count dropped ${before} → ${after} — ready for next cycle`);
      return after;
    }
    if (attempt < CONFIG.maxRecheckAttempts) {
      log(`⏳ Not dropped yet — waiting ${CONFIG.recheckWaitMs / 1000}s then reloading...`);
      await page.waitForTimeout(CONFIG.recheckWaitMs);
      await page.bringToFront();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(CONFIG.postReloadWaitMs);
      await closeModalIfPresent(page);
    }
  }
  log('⚠️ Count never dropped — continuing anyway');
  return before;
}

async function main({ searchUrl, maxLeads, onLog, onExported, sessionFile } = {}) {
  // If called from worker, use passed params. Otherwise use defaults.
  if (onLog)       _onLog = onLog;
  if (onExported)  _onExported = onExported;
  if (maxLeads)    _maxLeads = maxLeads;

  if (sessionFile) CONFIG.sessionFile = sessionFile;

  // Only write log file when running standalone
  if (!onLog) {
    _logStream = fs.createWriteStream(CONFIG.logFile, { flags: 'a' });
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 40,
    args: ['--start-maximized'],
  });

  process.on('SIGINT', async () => {
    log('🛑 SIGINT received — closing browser');
    try { await browser.close(); } catch {}
    if (_logStream) _logStream.end();
    process.exit(0);
  });

  process.on('unhandledRejection', (err) => {
    if (err?.message?.includes('Target page, context or browser has been closed')) return;
    log('Unhandled rejection: ' + err?.message);
  });

  let context;
  if (fs.existsSync(CONFIG.sessionFile)) {
    context = await browser.newContext({ storageState: CONFIG.sessionFile, viewport: null });
    log('✅ Session loaded');
  } else {
    context = await browser.newContext({ viewport: null });
  }

  let page = await context.newPage();
  await page.goto('https://app.apollo.io', { waitUntil: 'domcontentloaded' });

  if (!fs.existsSync(CONFIG.sessionFile)) {
    log('👉 Please login manually...');
    await page.waitForTimeout(CONFIG.loginTimeoutMs);
    await context.storageState({ path: CONFIG.sessionFile });
    log('✅ Session saved');
  } else {
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log('⚠️ Session expired — please login again');
      fs.unlinkSync(CONFIG.sessionFile);
      await page.waitForTimeout(CONFIG.loginTimeoutMs);
      await context.storageState({ path: CONFIG.sessionFile });
      log('✅ New session saved');
    } else {
      log('✅ Session is valid');
    }
  }

  // If no searchUrl passed, wait for user to press ENTER
  if (!searchUrl) {
    log('👉 Run your search in Apollo, then press ENTER here...');
    await new Promise(res => process.stdin.once('data', res));
    searchUrl = page.url();
  } else {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(CONFIG.postReloadWaitMs);
  }

  log(`🔖 Search URL locked: ${searchUrl}`);

  let failCount = 0;
  let totalExported = 0;

  while (true) {
    try {
      // Stop if credit limit reached
      if (totalExported >= _maxLeads) {
        log('🚫 Credit limit reached — stopping');
        break;
      }

      log('\n🚀 New cycle');
      await closeModalIfPresent(page);

      const before = await getResultCount(page);
      log(`📊 Net new before: ${before}`);

      if (before === 0) {
        log('🎉 Done — no net new leads left');
        break;
      }

      if (await detectLimit(page)) {
        log('🚫 Apollo limit detected — cooling down 30 min');
        await page.waitForTimeout(CONFIG.cooldownMs);
        continue;
      }

      /* STEP 1 — click header checkbox */
      log('🖱️ Clicking header checkbox...');
      const headerCheckbox = page.locator('input[data-interaction="Table Bulk Select Checkbox"]').first();
      await headerCheckbox.waitFor({ timeout: 10_000 });
      await headerCheckbox.click({ force: true });
      await page.waitForTimeout(1000);

      /* STEP 2 — click "Select all X,000" radio */
      log('🖱️ Selecting "Select all" radio option...');
      const selected = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('label, li, [class*="option"], [class*="row"]')];
        const selectAllRow = rows.find(el => {
          const text = el.innerText || '';
          return /select all/i.test(text) && /[\d,]{3,}/.test(text) && !/page/i.test(text);
        });
        if (selectAllRow) {
          const radio = selectAllRow.querySelector('input[type="radio"]');
          if (radio) { radio.click(); return 'radio clicked'; }
          selectAllRow.click();
          return 'row clicked';
        }
        const allRadios = [...document.querySelectorAll('input[type="radio"]')];
        const lastRadio = allRadios[allRadios.length - 1];
        if (lastRadio) { lastRadio.click(); return 'last radio clicked'; }
        return 'nothing found';
      });
      log(`✅ Select all result: ${selected}`);
      await page.waitForTimeout(500);

      /* STEP 3 — click Apply */
      log('🖱️ Clicking Apply...');
      let applyClicked = false;
      for (const sel of ['button:has-text("Apply")', '[class*="apply"]', '[data-testid*="apply"]']) {
        try {
          await page.waitForSelector(sel, { timeout: 2_000 });
          await page.click(sel);
          log(`✅ Clicked Apply via: ${sel}`);
          applyClicked = true;
          break;
        } catch { /* try next */ }
      }
      if (!applyClicked) {
        const applyBtn = await page.evaluateHandle(() =>
          [...document.querySelectorAll('button')].find(el => el.innerText?.trim() === 'Apply')
        );
        if (applyBtn?.asElement()) {
          await applyBtn.asElement().click();
          log('✅ Clicked Apply (fallback)');
          applyClicked = true;
        }
      }
      if (!applyClicked) throw new Error('Could not find Apply button');
      await page.waitForTimeout(CONFIG.postApplyDelayMs);

      const bodyText = await page.textContent('body');
      if (/clear\s+[\d,]+\s+selected/i.test(bodyText)) {
        const match = bodyText.match(/clear\s+([\d,]+)\s+selected/i);
        log(`☑️ Confirmed: ${match?.[1]} records selected`);
      } else {
        log('⚠️ Could not confirm selection — continuing anyway');
      }

      /* STEP 4 — click Export in toolbar */
      log('🖱️ Clicking Export in toolbar...');
      const exportBtn = await page.evaluateHandle(() => {
        const allEls = [...document.querySelectorAll('button, [role="button"], a')];
        const clearBtn = allEls.find(el => /clear\s+[\d,]+\s+selected/i.test(el.innerText || ''));
        if (clearBtn) {
          const toolbar = clearBtn.closest('div, nav, header, section, [class*="toolbar"], [class*="action"], [class*="bulk"], [class*="header"]');
          if (toolbar) {
            const btn = [...toolbar.querySelectorAll('button, [role="button"], a')]
              .find(el => (el.innerText || '').trim() === 'Export');
            if (btn) return btn;
          }
        }
        return allEls.find(el => (el.innerText || '').trim() === 'Export');
      });

      if (!exportBtn?.asElement()) {
        const dump = await page.evaluate(() =>
          [...document.querySelectorAll('button, [role="button"], a')]
            .map(el => (el.innerText || '').trim().slice(0, 40))
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(' | ')
        );
        log(`❌ Export not found. Buttons: ${dump}`);
        throw new Error('Could not find Export button');
      }

      await exportBtn.asElement().click();
      log('✅ Clicked Export');
      await page.waitForTimeout(CONFIG.postClickDelayMs);

      /* STEP 5 — Export to CSV modal → scroll → Export records */
      log('⏳ Waiting for Export to CSV modal...');
      await page.waitForSelector('text=Export to CSV', { timeout: 10_000 });
      log('✅ Export to CSV modal opened');

      await page.evaluate(() => {
        const modal = document.querySelector('[role="dialog"]');
        if (modal) modal.scrollTop = modal.scrollHeight;
        [...document.querySelectorAll('[role="dialog"] *')]
          .filter(el => el.scrollHeight > el.clientHeight)
          .forEach(el => el.scrollTop = el.scrollHeight);
      });
      await page.waitForTimeout(800);

      log('🖱️ Clicking Export records...');
      await page.waitForSelector('button:has-text("Export records")', { timeout: 5_000 });
      await page.click('button:has-text("Export records")');
      log('✅ Clicked Export records — watching progress bar...');

      /* STEP 6 — wait for progress bar to hit 100% then click X */
      await waitForProgressToFinish(page);

      // Report exported leads to worker for credit deduction
      if (_onExported) {
        await _onExported(1000);
        totalExported += 1000;
      }

      if (await detectLimit(page)) {
        log('🚫 Limit hit — cooling down 30 min');
        await page.waitForTimeout(CONFIG.cooldownMs);
      }

      failCount = 0;

      /* STEP 7 — open new tab, close old, wait for count to drop */
      page = await switchToNewTab(context, page, searchUrl);
      const after = await waitForCountToDrop(page, before, searchUrl);

      if (after === 0) {
        log('🎉 Done — no net new leads left');
        break;
      }

    } catch (err) {
      log(`⚠️ Error: ${err.message}`);
      failCount++;
      if (failCount >= CONFIG.maxFailures) {
        log('🛑 Too many failures — stopping');
        break;
      }
      try {
        await page.bringToFront();
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(CONFIG.postReloadWaitMs);
      } catch { /* ignore */ }
      await page.waitForTimeout(CONFIG.retryDelayMs);
    }
  }

  try { await browser.close(); } catch {}
  if (_logStream) _logStream.end();
}

// ── Export for worker ─────────────────────────────────────
async function runScraper({ searchUrl, maxLeads, onLog, onExported, sessionFile }) {
  await main({ searchUrl, maxLeads, onLog, onExported, sessionFile });
}

module.exports = { runScraper };

// ── Run standalone if called directly ────────────────────
if (require.main === module) {
  main();
}