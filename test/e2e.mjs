// End-to-end check of the storefront block against the dev harness, in real Chrome.
//   npm run e2e   (starts its own harness; screenshots -> test/screenshots/)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 3999;
const BASE = `http://localhost:${PORT}`;
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, ['dev/server.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => server.stdout.once('data', resolve));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let passed = 0;

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}\n    ${err.message.split('\n').join('\n    ')}`);
    process.exitCode = 1;
  }
}

async function newPage(viewport = { width: 1280, height: 900 }, mobile = false) {
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, permissions: ['clipboard-read', 'clipboard-write'] });
  context.setDefaultTimeout(5000);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return page;
}

/** Polls until fn() deep-equals expected (swipes settle asynchronously). */
async function until(fn, expected, ms = 3000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    try { assert.deepEqual(last, expected); return; } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.deepEqual(last, expected);
}

/** The look as the shopper sees it: centred item of every visible, active row. */
const look = (page) => page.locator('.ob-carousel:not([hidden]):not(.is-off) .ob-slide.is-current .ob-slide-title').allTextContents();
const current = (page, slot) => page.locator(`.ob-carousel--${slot} .ob-slide.is-current .ob-slide-title`).textContent();
const track = (page, slot) => page.locator(`.ob-carousel--${slot} .ob-track`);
const sheetLines = (page) => page.locator('.ob-sheet .ob-line-title').allTextContents();
const chip = (page, product, size) => page.locator('.ob-line', { hasText: product }).locator('.ob-chip', { hasText: new RegExp(`^${size}$`) });
const swipeBy = (page, slot, slides) => track(page, slot).evaluate((el, n) => el.scrollBy({ left: n * el.querySelector('.ob-slide').offsetWidth }), slides);
const openLook = (page) => page.locator('[data-action="open-look"]').click();
const closeSheet = (page) => page.locator('.ob-sheet-head [data-action="close"]').click();

try {
  const page = await newPage();
  await page.goto(BASE);

  await step('lands on a full-screen complete look with no prices anywhere', async () => {
    await until(() => look(page), ['Relaxed Linen Shirt', 'Straight Leg Jeans', 'Leather Chelsea Boots']);
    assert.equal(await page.locator('.ob-carousel--onepiece').isHidden(), true);
    assert.doesNotMatch(await page.locator('.ob-root').innerText(), /\$\d/, 'no prices on the builder');
    const bar = await page.locator('.ob-actionbar').boundingBox();
    assert.ok(bar.y + bar.height <= 900, 'action bar visible without scrolling');
  });
  await page.screenshot({ path: `${shots}1-desktop.png`, animations: 'disabled' });

  await step('next arrow, trackpad scroll and keyboard all swipe rows', async () => {
    await page.locator('.ob-carousel--top .ob-nav--next').click();
    await until(() => current(page, 'top'), 'Heavyweight Tee');
    await swipeBy(page, 'bottom', 1);
    await until(() => current(page, 'bottom'), 'Pleated Wide Trousers');
    await track(page, 'shoes').focus();
    await page.keyboard.press('ArrowRight');
    await until(() => look(page), ['Heavyweight Tee', 'Pleated Wide Trousers', 'Canvas Low Sneakers']);
  });

  await step('"Get this look" opens a sheet with sizes (still no prices); Escape closes it', async () => {
    await openLook(page);
    assert.deepEqual(await sheetLines(page), ['Heavyweight Tee', 'Pleated Wide Trousers', 'Canvas Low Sneakers']);
    assert.doesNotMatch(await page.locator('.ob-sheet').innerText(), /\$\d/);
    assert.equal(await page.locator('.ob-add').isDisabled(), true);
    assert.match(await page.locator('.ob-hint').textContent(), /Choose a size/);
    assert.match(await page.locator('.ob-offer').textContent(), /10% off at checkout/);
    assert.equal(await chip(page, 'Heavyweight Tee', 'XS').isDisabled(), true, 'sold-out size');
    await chip(page, 'Heavyweight Tee', 'M').click();
    await page.screenshot({ path: `${shots}2-desktop-sheet.png`, animations: 'disabled' });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ob-sheet').isHidden(), true);
  });

  await step('chosen size is remembered when swiping away and back', async () => {
    await page.locator('.ob-carousel--top .ob-nav--next').click();
    await until(() => current(page, 'top'), 'Striped Breton Top');
    await page.locator('.ob-carousel--top .ob-nav--prev').click();
    await until(() => current(page, 'top'), 'Heavyweight Tee');
    await openLook(page);
    assert.equal(await chip(page, 'Heavyweight Tee', 'M').getAttribute('aria-checked'), 'true');
    await closeSheet(page);
  });

  await step('Dress mode swaps top + bottom for a dress; switching back restores them', async () => {
    await page.getByRole('button', { name: 'Dress', exact: true }).click();
    await until(() => look(page), ['Wrap Midi Dress', 'Canvas Low Sneakers']);
    await swipeBy(page, 'onepiece', 1);
    await until(() => current(page, 'onepiece'), 'Utility Jumpsuit');
    await page.getByRole('button', { name: 'Top & bottom' }).click();
    await until(() => look(page), ['Heavyweight Tee', 'Pleated Wide Trousers', 'Canvas Low Sneakers']);
  });

  await step('removing a piece in the sheet dims its row; "Tap to add back" restores it', async () => {
    await openLook(page);
    await page.locator('.ob-line', { hasText: 'Canvas Low Sneakers' }).locator('.ob-remove').click();
    assert.deepEqual(await sheetLines(page), ['Heavyweight Tee', 'Pleated Wide Trousers']);
    await closeSheet(page);
    await page.waitForTimeout(300); // a settle after removal must not silently re-add it
    assert.deepEqual(await look(page), ['Heavyweight Tee', 'Pleated Wide Trousers']);
    await page.locator('.ob-carousel--shoes .ob-add-back').click();
    assert.deepEqual(await look(page), ['Heavyweight Tee', 'Pleated Wide Trousers', 'Canvas Low Sneakers']);
  });

  await step('Style me suggests looks built around the piece you last chose', async () => {
    await swipeBy(page, 'top', -1); // back to the Linen Shirt (tagged look:weekend)
    await until(() => current(page, 'top'), 'Relaxed Linen Shirt');
    await page.locator('[data-action="open-suggest"]').click();
    const cards = page.locator('.ob-look-load');
    assert.equal(await cards.count(), 4);
    const first = await cards.first().getAttribute('aria-label');
    assert.match(first, /Relaxed Linen Shirt, Linen Drawstring Shorts, Strappy Sandals/, 'merchant look:weekend wins');
    await page.screenshot({ path: `${shots}3-desktop-suggest.png`, animations: 'disabled' });
    await cards.first().click();
    assert.equal(await page.locator('.ob-sheet').isHidden(), true);
    await until(() => look(page), ['Relaxed Linen Shirt', 'Linen Drawstring Shorts', 'Strappy Sandals']);
  });

  await step('"More ideas" gives a fresh set', async () => {
    await page.locator('[data-action="open-suggest"]').click();
    await page.locator('[data-action="more-looks"]').click();
    assert.equal(await page.locator('.ob-look-load').count(), 4);
    await closeSheet(page);
  });

  let code;
  await step('save (♡) persists; saved looks sheet re-wears it; share link restores look + sizes', async () => {
    await page.locator('[data-action="save"]').click();
    assert.equal(await page.locator('[data-action="save"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { Object.defineProperty(Navigator.prototype, 'share', { value: undefined }); });
    await openLook(page);
    await chip(page, 'Relaxed Linen Shirt', 'M').click();
    await chip(page, 'Linen Drawstring Shorts', 'S').click();
    await chip(page, 'Strappy Sandals', '39').click();
    await closeSheet(page);
    await page.locator('[data-action="share"]').click();
    await page.locator('.ob-status', { hasText: 'Link copied' }).waitFor();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    code = new URL(link).searchParams.get('outfit');

    const other = await newPage();
    await other.goto(link);
    await until(() => look(other), ['Relaxed Linen Shirt', 'Linen Drawstring Shorts', 'Strappy Sandals']);
    await openLook(other);
    assert.equal(await chip(other, 'Strappy Sandals', '39').getAttribute('aria-checked'), 'true');
    await other.context().close();

    await page.goto(BASE);
    await page.locator('[data-action="open-saved"]').click();
    assert.equal(await page.locator('.ob-look-card').count(), 1);
    await page.locator('.ob-look-load').click();
    await until(() => look(page), ['Relaxed Linen Shirt', 'Linen Drawstring Shorts', 'Strappy Sandals']);
  });

  await step('share link with a now-sold-out size blocks adding with a clear message', async () => {
    const p = await newPage();
    await p.goto(`${BASE}/?outfit=7003-700301`); // Cropped Cardigan, size S (sold out)
    await openLook(p);
    assert.match(await p.locator('.ob-hint').textContent(), /sold out in that size/);
    assert.equal(await p.locator('.ob-add').isDisabled(), true);
    await p.context().close();
  });

  await step('one tap adds the whole look to the cart, with attribution + bundle discount', async () => {
    await page.goto(`${BASE}/cart/clear`);
    await page.goto(`${BASE}/?outfit=${code}`);
    await openLook(page);
    await Promise.all([page.waitForURL(`${BASE}/cart`), page.locator('.ob-add').click()]);
    const rows = await page.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map((r) => r[3])).size, 1, 'all lines share one outfit id');
    assert.ok(rows.every((r) => r[5].includes('Outfit bundle 10% off')));
    await page.screenshot({ path: `${shots}4-cart.png`, fullPage: true });
  });

  await step('"stay on page" mode closes the sheet, confirms, and the theme cart count updates', async () => {
    await page.goto(`${BASE}/cart/clear`);
    await page.goto(`${BASE}/?after=stay&outfit=${code}`);
    await openLook(page);
    await page.locator('.ob-add').click();
    await page.locator('.ob-status', { hasText: 'Look added to your bag' }).waitFor();
    assert.equal(await page.locator('.ob-sheet').isHidden(), true);
    await page.locator('#cart-count', { hasText: '3' }).waitFor();
  });

  await step('collection mode (one collection per category) works the same', async () => {
    await page.goto(`${BASE}/?mode=collections`);
    await until(() => look(page), ['Relaxed Linen Shirt', 'Straight Leg Jeans', 'Leather Chelsea Boots']);
  });

  await step('Shuffle swaps in a random complete look and scrolls every row to it', async () => {
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-action="shuffle"]').click();
      await page.waitForTimeout(700);
      const shown = await look(page);
      assert.ok(shown.length === 3 || shown.length === 2, shown.join(', '));
      await openLook(page);
      assert.deepEqual(await sheetLines(page), shown, 'rows match the look in the sheet');
      await closeSheet(page);
    }
  });

  // ---- real touch gestures on a phone-sized viewport ----
  const mobile = await newPage({ width: 390, height: 844 }, true);
  const cdp = await mobile.context().newCDPSession(mobile);
  const touchSwipe = async (slot, xDistance, yDistance = 0) => {
    const box = await track(mobile, slot).boundingBox();
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2),
      xDistance, yDistance, gestureSourceType: 'touch', speed: 2400,
    });
  };

  await step('mobile: whole builder incl. action bar fits the screen below the store header', async () => {
    await mobile.goto(BASE);
    const bar = await mobile.locator('.ob-actionbar').boundingBox();
    assert.ok(bar.y + bar.height <= 844, `action bar bottom at ${bar.y + bar.height}`);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'no sideways scroll');
  });
  await mobile.screenshot({ path: `${shots}5-mobile.png`, animations: 'disabled' });

  await step('mobile: finger swipe left/right changes the top, one item per fling', async () => {
    await until(() => current(mobile, 'top'), 'Relaxed Linen Shirt');
    await touchSwipe('top', -360);
    await until(() => current(mobile, 'top'), 'Heavyweight Tee');
    await mobile.waitForTimeout(400);
    assert.equal(await current(mobile, 'top'), 'Heavyweight Tee');
    await touchSwipe('top', 220);
    await until(() => current(mobile, 'top'), 'Relaxed Linen Shirt');
  });

  await step('mobile: tapping the peeking next item brings it in', async () => {
    const peek = mobile.locator('.ob-carousel--shoes .ob-slide').nth(1);
    const box = await peek.boundingBox();
    await mobile.touchscreen.tap(Math.min(box.x + 20, 385), box.y + box.height / 2);
    await until(() => current(mobile, 'shoes'), 'Canvas Low Sneakers');
  });

  await step('mobile: sheet opens over the builder and locks page scroll', async () => {
    await mobile.locator('[data-action="open-look"]').tap();
    assert.equal(await mobile.evaluate(() => document.documentElement.classList.contains('ob-lock')), true);
    await mobile.screenshot({ path: `${shots}6-mobile-sheet.png`, animations: 'disabled' });
    await mobile.locator('.ob-sheet-backdrop').tap({ position: { x: 20, y: 20 } });
    assert.equal(await mobile.locator('.ob-sheet').isHidden(), true);
    assert.equal(await mobile.evaluate(() => document.documentElement.classList.contains('ob-lock')), false);
  });

  await step('no console or page errors', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await browser.close();
  server.kill();
}

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}. Screenshots in test/screenshots/`);
