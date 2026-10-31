// The exhibition homepage mockup (Matt, 23 Oct 2026; v2 and v3 the same day):
// each section's final state (reduced motion) as screenshots, a full
// scroll-through recording with motion on (down, then back up through three
// chapters), a recording of clicking a loop node and landing on its chapter,
// and one of the sticky header and "Skip the tour", at 1440 and 390 wide.
// Needs `npm run dev`.
//
//   npx tsx scripts/capture-exhibition.ts [shots|video|click|header|reveal|pages|slides|laptops|cast|loop|hood|pace] [route]
//
// `pages` (24 Oct, the two-page split): full scrolls of the homepage and the
// product page (the homepage scrolls back up through What sets us apart, so
// its screens reverse), a homepage loop node opening its product chapter,
// and What sets us apart under reduced motion as stills.
// `slides` (24 Oct): What sets us apart as stacking slides: scrolling down
// through the three and back up, clicking a collapsed tab, each slide in its
// full state, and the reduced-motion version.
// `laptops` (24 Oct): the stack on 13-inch-class windows (1280×720 and
// 1440×800, the compact stack): each slide settled, and a slide mid-cover.
// `cast` (25 Oct): each slide with its characters at 1280×720, 1440×800,
// 1440×900 and 1920×1080, and each phone slide at 390.
// `pace` (28 Oct): the loop's runway at 1440×900: a normal-pace scroll
// through it, back up, then one fast flick down.
// `hood` (28 Oct): the Under the hood slide: a scroll from slide 03 into it
// and back (1440×900), its settled state at 1280×720, 1440×900 and
// 1920×1080, the phone card (390) and reduced motion (1440 and 390).
// `loop` (27 Oct): the loop's progress line: a scroll down through it and
// back up (1440×900 and 390), its end state at 1280, 1440 and 1920 wide, and
// the reduced-motion version (1440 and 390).
//
// Writes mockups/screenshots/exhibition-<section>-<size>.png and
// mockups/recordings/exhibition-<size>.webm, exhibition-loop-click-<size>.webm,
// exhibition-header-skip-<size>.webm.
// `route` defaults to /mockups/exhibition.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium, type Browser, type Page } from 'playwright';

const BASE = process.env.LANDING_BASE_URL ?? 'http://localhost:3000';
const ROUTE = process.argv[3] ?? '/mockups/exhibition';
const URL = `${BASE}${ROUTE}`;
const SHOTS = path.join(process.cwd(), 'mockups', 'screenshots');
const VIDEOS = path.join(process.cwd(), 'mockups', 'recordings');
const SIZES: [string, number, number][] = [['desktop', 1440, 900], ['mobile', 390, 844]];
// The dev overlay and the mockup-only A/B toggle stay out of the captures.
const HIDE_DEV = 'nextjs-portal, [data-mock-control] { display: none !important; }';

async function settle(page: Page) {
  await page.addStyleTag({ content: HIDE_DEV });
  await page.evaluate(() => document.fonts.ready);
}

// One smooth scroll, animated in the page, so recordings run in real time.
// Passed as a string: tsx's name helpers don't exist in the page.
const glide = (page: Page, to: number, ms: number) => page.evaluate(`new Promise(done => {
  const from = window.scrollY, start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / ${ms});
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    window.scrollTo(0, from + (${to} - from) * eased);
    if (t < 1) requestAnimationFrame(tick); else done();
  };
  requestAnimationFrame(tick);
})`);

async function shots(browser: Browser) {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const [size, width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: size === 'mobile' ? 2 : 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await settle(page);
    const names = await page.locator('[data-shot]').evaluateAll(els => els.map(e => e.getAttribute('data-shot')!));
    for (const name of names) {
      const file = path.join(SHOTS, `exhibition-${name}-${size}.png`);
      await page.locator(`[data-shot="${name}"]`).screenshot({ path: file });
      console.log('wrote', path.relative(process.cwd(), file));
    }
    await context.close();
  }
}

async function record(browser: Browser, size: string, width: number, height: number, name: string, act: (page: Page) => Promise<void>, query = '', route = ROUTE) {
  fs.mkdirSync(VIDEOS, { recursive: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exhibition-video-'));
  const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir, size: { width, height } } });
  const page = await context.newPage();
  await page.goto(BASE + route + query, { waitUntil: 'networkidle', timeout: 120000 });
  await settle(page);
  await act(page);
  const handle = page.video()!;
  await context.close();
  const out = path.join(VIDEOS, `${name}-${size}.webm`);
  fs.copyFileSync(await handle.path(), out);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('wrote', path.relative(process.cwd(), out));
}

// A full, unhurried scroll: the hero loop once, then each section. Chapters
// are scroll-scrubbed (v3), so each track is scrolled through at a steady
// pace, then the scroll goes back up through 06, 05 and 04 (each reverses)
// before finishing at the close.
async function video(browser: Browser) {
  for (const [size, width, height] of SIZES) {
    await record(browser, size, width, height, 'exhibition', async page => {
      if (size === 'mobile') {
        await page.waitForTimeout(1200);
        const rail = await page.locator('[aria-label="Demo steps"]').evaluate(el => el.getBoundingClientRect().bottom + window.scrollY);
        await glide(page, rail - height + 70, 1200);
      }
      await page.waitForTimeout(12500);
      const top = (sel: string) => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().top + window.scrollY);
      await glide(page, await top('[data-shot="stats"]') - 40, 1400);
      await page.waitForTimeout(1800);
      await glide(page, await top('[data-shot="loop"]'), 1400);
      await page.waitForTimeout(1200);
      await glide(page, await top('[data-shot="loop"] nav') - 80, 1400);
      await page.waitForTimeout(2200);
      const tracks: Record<string, { top: number; end: number; len: number }> = {};
      for (const id of ['diagnose', 'plan', 'learn', 'drill', 'mock', 'adapt']) {
        const box = await page.locator(`#${id} [data-track]`).evaluate(el => ({ top: el.getBoundingClientRect().top + window.scrollY, h: el.getBoundingClientRect().height, len: Number(getComputedStyle(el).getPropertyValue('--len')) }));
        tracks[id] = { top: box.top, end: box.top + box.h - height, len: box.len };
        await glide(page, size === 'mobile' ? await top(`#${id}`) : box.top, 1300);
        await page.waitForTimeout(size === 'mobile' ? 1500 : 900);
        if (size === 'mobile') await glide(page, box.top, 900);
        // About 6 s per screen of track; chapter 01 slower, for its words.
        await glide(page, tracks[id].end, box.len * (id === 'diagnose' ? 9000 : 6000));
        await page.waitForTimeout(1400);
      }
      // Back up: 06, 05 and 04 rewind.
      for (const id of ['adapt', 'mock', 'drill']) {
        await glide(page, tracks[id].top, tracks[id].len * 3500);
        await page.waitForTimeout(900);
      }
      await glide(page, tracks.adapt.end, 3000);
      await page.waitForTimeout(1200);
      await glide(page, await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 1600);
      await page.waitForTimeout(2000);
    });
  }
}

// The sticky header appearing once the hero's button scrolls away, then
// "Skip the tour" jumping to the technology, and the header's "How it works"
// coming back to the loop.
async function header(browser: Browser) {
  for (const [size, width, height] of SIZES) {
    await record(browser, size, width, height, 'exhibition-header-skip', async page => {
      const top = (sel: string) => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().top + window.scrollY);
      await page.waitForTimeout(1500);
      const cta = await top('#hero-cta');
      await glide(page, cta - height * 0.5, 1400);
      await page.waitForTimeout(800);
      await glide(page, cta + 120, 1200);
      await page.waitForTimeout(1600);
      const skip = page.getByRole('link', { name: 'Skip the tour' });
      await glide(page, await skip.evaluate(el => el.getBoundingClientRect().top + window.scrollY) - height * 0.55, 2200);
      await page.waitForTimeout(1000);
      await skip.hover();
      await page.waitForTimeout(800);
      await skip.click();
      await page.waitForTimeout(3000);
      if (size === 'desktop') {
        const how = page.locator('[data-sticky-header] a, header[data-on] a', { hasText: 'How it works' });
        await how.hover();
        await page.waitForTimeout(800);
        await how.click();
        await page.waitForTimeout(3000);
      }
    });
  }
}

// Clicking a loop node: the page scrolls smoothly to its chapter, and the
// rail picks it up; then a rail node takes you back to another chapter.
async function click(browser: Browser) {
  for (const [size, width, height] of SIZES) {
    await record(browser, size, width, height, 'exhibition-loop-click', async page => {
      const nav = page.locator('[data-shot="loop"] nav');
      const y = await nav.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
      await page.evaluate(`window.scrollTo(0, ${y - (size === 'mobile' ? 120 : 220)})`);
      await page.waitForTimeout(1500);
      const link = page.locator('[data-shot="loop"] nav a[href="#drill"]').filter({ visible: true }).first();
      await link.hover();
      await page.waitForTimeout(700);
      await link.click();
      await page.waitForTimeout(3500);
      await page.locator('nav[aria-label="Chapters"] a[href="#learn"]').filter({ visible: true }).first().click();
      await page.waitForTimeout(3500);
    });
  }
}

// The reveals (24 Oct): one slow and one fast continuous scroll through the
// whole page, top to bottom.
async function reveal(browser: Browser) {
  for (const [pace, ms] of [['slow', { desktop: 90000, mobile: 110000 }], ['fast', { desktop: 9000, mobile: 11000 }]] as const) {
    for (const [size, width, height] of SIZES) {
      await record(browser, size, width, height, `exhibition-reveal-${pace}`, async page => {
        await page.waitForTimeout(1500);
        const end = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
        await glide(page, end, ms[size as 'desktop' | 'mobile']);
        await page.waitForTimeout(1500);
      });
    }
  }
}

const HOME = '/mockups/exhibition';
const PRODUCT = '/mockups/exhibition/product';
const topOf = (page: Page, sel: string) => page.locator(sel).first().evaluate(el => el.getBoundingClientRect().top + window.scrollY);

async function pages(browser: Browser) {
  for (const [size, width, height] of SIZES) {
    const mobile = size === 'mobile';
    // The homepage, top to bottom; on desktop the pinned device is scrubbed
    // through, back up (the screens reverse), and down again.
    await record(browser, size, width, height, 'exhibition-home', async page => {
      await page.waitForTimeout(4000);
      await glide(page, await topOf(page, '[data-shot="stats"]') - 40, 1400);
      await page.waitForTimeout(1600);
      await glide(page, await topOf(page, '[data-shot="loop"]'), 1400);
      await page.waitForTimeout(1200);
      await glide(page, await topOf(page, '[data-shot="loop"] nav') - 80, 1400);
      await page.waitForTimeout(2000);
      await glide(page, await topOf(page, '#apart'), 1600);
      await page.waitForTimeout(1500);
      for (const i of [0, 1, 2, 3]) { await glide(page, await restOf(page, i), 3000); await page.waitForTimeout(i === 0 ? 4500 : 1500); }
      await glide(page, await topOf(page, '#apart a[href$="/product"]') - height * 0.6, 1400);
      await page.waitForTimeout(1400);
      await glide(page, await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 3500);
      await page.waitForTimeout(2000);
    }, '', HOME);

    // The product page: intro, loop, the six chapters at a steady pace, the close.
    await record(browser, size, width, height, 'exhibition-product', async page => {
      await page.waitForTimeout(1800);
      await glide(page, await topOf(page, '[data-shot="loop"] nav') - 80, 2200);
      await page.waitForTimeout(2000);
      for (const id of ['diagnose', 'plan', 'learn', 'drill', 'mock', 'adapt']) {
        const box = await page.locator(`#${id} [data-track]`).evaluate(el => ({ top: el.getBoundingClientRect().top + window.scrollY, h: el.getBoundingClientRect().height, len: Number(getComputedStyle(el).getPropertyValue('--len')) }));
        await glide(page, mobile ? await topOf(page, `#${id}`) : box.top, 1300);
        await page.waitForTimeout(mobile ? 1400 : 800);
        if (mobile) await glide(page, box.top, 900);
        await glide(page, box.top + box.h - height, box.len * (id === 'diagnose' ? 8000 : 5000));
        await page.waitForTimeout(1000);
      }
      await glide(page, await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight), 3000);
      await page.waitForTimeout(2000);
    }, '', PRODUCT);

    // A homepage loop node opening its chapter on the product page.
    await record(browser, size, width, height, 'exhibition-node-click', async page => {
      await page.waitForTimeout(800);
      const node = page.locator('#how a[href$="#drill"]:visible');
      await glide(page, await node.evaluate(el => el.getBoundingClientRect().top + window.scrollY) - height * 0.45, 1800);
      await page.waitForTimeout(1200);
      await node.hover();
      await page.waitForTimeout(700);
      await node.click();
      await page.waitForURL('**/product#drill');
      await page.addStyleTag({ content: HIDE_DEV });
      await page.waitForTimeout(2500);
      const box = await page.locator('#drill [data-track]').evaluate(el => ({ top: el.getBoundingClientRect().top + window.scrollY, h: el.getBoundingClientRect().height }));
      await glide(page, box.top + box.h - height, 6000);
      await page.waitForTimeout(1500);
    }, '', HOME);

    // What sets us apart, reduced motion: each block beside its own screen.
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    await page.addStyleTag({ content: '[data-sticky-header] { display: none !important; }' });
    const file = path.join(SHOTS, `exhibition-apart-reduced-${size}.png`);
    await page.locator('#apart').screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
    await context.close();
  }
}

// The stacking slides (What sets us apart): where slide i rests once settled.
const restOf = (page: Page, i: number) => page.evaluate(`(() => { const sl = document.querySelectorAll('#apart [style*="--i"]')[${i}]; const top = getComputedStyle(sl).position === 'sticky' ? parseFloat(getComputedStyle(sl).top) : 80; return sl.previousElementSibling.getBoundingClientRect().top + scrollY - top; })()`) as Promise<number>;

async function slides(browser: Browser) {
  for (const [size, width, height] of SIZES) {
    const mobile = size === 'mobile';
    // Down through the three slides (slide 1's voice exhibit plays as it
    // settles), on to the buttons, then back up through them.
    await record(browser, size, width, height, 'exhibition-slides', async page => {
      const r = [await restOf(page, 0), await restOf(page, 1), await restOf(page, 2)];
      await glide(page, r[0] - height * 0.7, 1500);
      await page.waitForTimeout(600);
      await glide(page, r[0], 2200);
      await page.waitForTimeout(4800);
      if (mobile) {
        // Unstacked on phones: each slide read top to bottom.
        for (const i of [0, 1, 2]) {
          const box = await page.locator('#apart [style*="--i"]').nth(i).evaluate(el => ({ top: el.getBoundingClientRect().top + window.scrollY, h: el.getBoundingClientRect().height }));
          await glide(page, box.top - 70, 1500);
          await glide(page, box.top + box.h - height + 40, Math.max(2500, box.h * 3));
          await page.waitForTimeout(600);
        }
      } else {
        await glide(page, r[1], 3800);
        await page.waitForTimeout(1500);
        await glide(page, r[2], 3800);
        await page.waitForTimeout(1500);
      }
      await glide(page, await topOf(page, '#apart a.btn-primary') - height * 0.6, 3000);
      await page.waitForTimeout(1500);
      for (const i of [2, 1, 0]) { await glide(page, r[i], 3500); await page.waitForTimeout(1000); }
      await glide(page, r[0] - height * 0.7, 2000);
      await page.waitForTimeout(800);
    }, '', HOME);

    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1 });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    const walkTo = async (y: number, wait = 700) => { for (let k = 0; k <= 8; k++) { await page.evaluate(`scrollTo(0, ${y - 32 + k * 4})`); await page.waitForTimeout(30); } await page.waitForTimeout(wait); };
    for (const i of [0, 1, 2]) {
      const file = path.join(SHOTS, `exhibition-slide-${i + 1}-${size}.png`);
      if (mobile) {
        await walkTo(await restOf(page, i), i === 0 ? 4800 : 700);
        await page.addStyleTag({ content: '[data-sticky-header] { visibility: hidden !important; }' });
        await page.locator('#apart [style*="--i"]').nth(i).screenshot({ path: file });
        await page.addStyleTag({ content: '[data-sticky-header] { visibility: visible !important; }' });
      } else {
        await walkTo(await restOf(page, i), i === 0 ? 4800 : 700);
        await page.screenshot({ path: file });
      }
      console.log('wrote', path.relative(process.cwd(), file));
    }
    await context.close();

    // Reduced motion: the three slides one after another, final states.
    const rm = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, reducedMotion: 'reduce' });
    const rp = await rm.newPage();
    await rp.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(rp);
    await rp.addStyleTag({ content: '[data-sticky-header] { display: none !important; }' });
    const file = path.join(SHOTS, `exhibition-slides-reduced-${size}.png`);
    await rp.locator('#apart').screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
    await rm.close();
  }
  // Clicking a collapsed tab (desktop): slide 3 settled, then slide 1's tab.
  await record(browser, 'desktop', 1440, 900, 'exhibition-slides-tab-click', async page => {
    const r2 = await restOf(page, 2);
    await glide(page, r2 - 900, 1500);
    await glide(page, r2, 4000);
    await page.waitForTimeout(1500);
    const tab = page.locator('#apart button[data-tab]').first();
    await tab.hover();
    await page.waitForTimeout(900);
    await tab.click();
    await page.waitForTimeout(3000);
    await page.locator('#apart button[data-tab]').nth(1).isVisible();
    await glide(page, r2, 3000);
    await page.waitForTimeout(1000);
    await page.locator('#apart button[data-tab]').nth(1).click();
    await page.waitForTimeout(2500);
  }, '', HOME);
}

async function laptops(browser: Browser) {
  for (const [width, height] of [[1280, 720], [1440, 800]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    const walkTo = async (y: number, wait = 700) => { for (let k = 0; k <= 8; k++) { await page.evaluate(`scrollTo(0, ${y - 32 + k * 4})`); await page.waitForTimeout(30); } await page.waitForTimeout(wait); };
    const r = [await restOf(page, 0), await restOf(page, 1), await restOf(page, 2)];
    const shots: [string, number, number][] = [['1', r[0], 4800], ['2', r[1], 700], ['2-covering', (r[1] + r[2]) / 2, 700], ['3', r[2], 700]];
    for (const [name, y, wait] of shots) {
      await walkTo(y, wait);
      const file = path.join(SHOTS, `exhibition-slide-${name}-${width}x${height}.png`);
      await page.screenshot({ path: file });
      console.log('wrote', path.relative(process.cwd(), file));
    }
    await context.close();
  }
}

async function cast(browser: Browser) {
  for (const [width, height] of [[1280, 720], [1440, 800], [1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    for (const i of [0, 1, 2]) {
      const y = await restOf(page, i);
      for (let k = 0; k <= 8; k++) { await page.evaluate(`scrollTo({ top: ${y - 32 + k * 4}, behavior: 'instant' })`); await page.waitForTimeout(30); }
      await page.waitForTimeout(900);
      const file = path.join(SHOTS, `exhibition-cast-s${i + 1}-${width}x${height}.png`);
      await page.screenshot({ path: file });
      console.log('wrote', path.relative(process.cwd(), file));
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
  await settle(page);
  await page.addStyleTag({ content: '[data-sticky-header] { display: none !important; } [data-reveal] { opacity: 1 !important; transform: none !important; }' });
  for (const i of [0, 1, 2]) {
    const file = path.join(SHOTS, `exhibition-cast-s${i + 1}-390.png`);
    await page.locator('#apart [style*="--i"]').nth(i).screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
  }
  await context.close();
}

// Where the loop's progress starts and ends, as scroll positions: desktops
// the runway (28 Oct: from the diagram pinning to its release); phones
// from the fill line (75% down) at the track's top to 45% of a window past
// its bottom (the second pass).
async function loopSpan(page: Page, width: number, height: number) {
  const nav = await page.locator('#how nav').evaluate(el => { const r = el.getBoundingClientRect(), run = el.parentElement!.getBoundingClientRect(); return { top: r.top + window.scrollY, h: r.height, runTop: run.top + window.scrollY, runH: run.height, pin: parseFloat(getComputedStyle(el).top) || 0 }; });
  return width >= 1024
    ? [nav.runTop - nav.pin, nav.runTop + nav.runH - nav.h - nav.pin]
    : [nav.top - 0.75 * height, nav.top - 0.75 * height + nav.h + 0.45 * height];
}

async function loop(browser: Browser) {
  for (const [size, width, height] of SIZES) {
    await record(browser, size, width, height, 'exhibition-loop', async page => {
      const [from, to] = await loopSpan(page, width, height);
      await page.evaluate(`scrollTo(0, ${from - 200})`);
      await page.waitForTimeout(1500);
      await glide(page, to + 60, size === 'mobile' ? 9000 : 7000);
      await page.waitForTimeout(2000);
      await glide(page, from - 120, 5000);
      await page.waitForTimeout(1500);
      await glide(page, to + 60, 4500);
      await page.waitForTimeout(2500);
    }, '', HOME);
  }
  for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    const [from, to] = await loopSpan(page, width, height);
    // The end state holds over the last 7% of the span: stop where the whole diagram clears the header.
    const end = Math.min(to, Math.max(to - 0.07 * (to - from), (await page.locator('#how nav').evaluate(el => el.getBoundingClientRect().top + window.scrollY)) - 72));
    for (let k = 0; k <= 20; k++) { await page.evaluate(`scrollTo({ top: ${from + (end - from) * k / 20}, behavior: 'instant' })`); await page.waitForTimeout(40); }
    await page.waitForTimeout(2500);
    const file = path.join(SHOTS, `exhibition-loop-end-${width}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
    await context.close();
  }
  for (const [size, width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: size === 'mobile' ? 2 : 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    await page.addStyleTag({ content: '[data-sticky-header] { display: none !important; }' });
    const file = path.join(SHOTS, `exhibition-loop-reduced-${size}.png`);
    await page.locator('#how nav').screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
    await context.close();
  }
}

async function pace(browser: Browser) {
  await record(browser, 'desktop', 1440, 900, 'exhibition-loop-pace', async page => {
    const [from, to] = await loopSpan(page, 1440, 900);
    await page.evaluate(`scrollTo(0, ${from - 500})`);
    await page.waitForTimeout(1200);
    await glide(page, from, 1500);
    await page.waitForTimeout(600);
    // A normal pace: about 10 s for the runway.
    await glide(page, to + 100, 10000);
    await page.waitForTimeout(2000);
    await glide(page, from - 300, 6000);
    await page.waitForTimeout(1500);
    // One fast flick.
    await glide(page, to + 100, 450);
    await page.waitForTimeout(3000);
  }, '', HOME);
}

async function hood(browser: Browser) {
  await record(browser, 'desktop', 1440, 900, 'exhibition-hood', async page => {
    const [r2, r3] = [await restOf(page, 2), await restOf(page, 3)];
    await page.evaluate(`scrollTo(0, ${r2 - 300})`);
    await page.waitForTimeout(800);
    await glide(page, r2, 1500);
    await page.waitForTimeout(1500);
    await glide(page, r3, 5000);
    await page.waitForTimeout(3000);
    await glide(page, r2, 4500);
    await page.waitForTimeout(1500);
    await glide(page, r3, 3500);
    await page.waitForTimeout(3000);
  }, '', HOME);
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    const y = await restOf(page, 3);
    for (let k = 0; k <= 10; k++) { await page.evaluate(`scrollTo({ top: ${y - 50 + k * 5}, behavior: 'instant' })`); await page.waitForTimeout(30); }
    await page.waitForTimeout(2200);
    const file = path.join(SHOTS, `exhibition-hood-${width}x${height}.png`);
    await page.screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
    await context.close();
  }
  for (const [name, width, height, reduced] of [['mobile', 390, 844, false], ['reduced-desktop', 1440, 900, true], ['reduced-mobile', 390, 844, true]] as [string, number, number, boolean][]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 500 ? 2 : 1, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await page.goto(BASE + HOME, { waitUntil: 'networkidle' });
    await settle(page);
    await page.addStyleTag({ content: '[data-sticky-header] { display: none !important; }' });
    const top = await topOf(page, '#under-the-hood');
    for (let k = 0; k <= 10; k++) { await page.evaluate(`scrollTo({ top: ${top - height + k * 60}, behavior: 'instant' })`); await page.waitForTimeout(40); }
    await page.waitForTimeout(2200);
    const file = path.join(SHOTS, `exhibition-hood-${name}.png`);
    await page.locator('#under-the-hood').screenshot({ path: file });
    console.log('wrote', path.relative(process.cwd(), file));
    await context.close();
  }
}

async function main() {
  const what = process.argv[2];
  const browser = await chromium.launch();
  try {
    if (!what || what === 'shots') await shots(browser);
    if (!what || what === 'video') await video(browser);
    if (!what || what === 'click') await click(browser);
    if (!what || what === 'header') await header(browser);
    if (!what || what === 'reveal') await reveal(browser);
    if (what === 'pages') await pages(browser);
    if (what === 'slides') await slides(browser);
    if (what === 'laptops') await laptops(browser);
    if (what === 'cast') await cast(browser);
    if (what === 'loop') await loop(browser);
    if (what === 'hood') await hood(browser);
    if (what === 'pace') await pace(browser);
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
