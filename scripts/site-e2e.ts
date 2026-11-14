// End-to-end browser test of the site (Lorenzo, 12 Nov: "full browser testing of all features"). Drives Chromium
// against a running server and checks what each screen says. Phase A is free (no AI calls); phase B runs a text
// interview on the demo case to its report and PDF, and one drill set (paid: Lorenzo's go, 12 Nov, about $1).
// The test account is E2E_EMAIL (signed up in A, deleted at the end of C). Run A, B, C in order. With no
// RESEND_API_KEY on the server, sign-up confirms at once; the email flow is checked on the deployed site by hand.
//
//   E2E_EMAIL=you+test@example.com E2E_BASE_URL=http://localhost:3920 \
//     npx tsx --conditions=react-server --env-file=.env.local scripts/site-e2e.ts A   (then B, then C)
// Screenshots: logs/e2e/<run>/. State between phases (the passwords): logs/e2e/state.json (gitignored logs/).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { chromium, type Page } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3920';
const EMAIL = process.env.E2E_EMAIL ?? '';   // a test address you control; the script signs it up and deletes it
const PHASE = process.argv[2] ?? 'A';
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const DIR = path.join(process.cwd(), 'logs', 'e2e', `${RUN}-${PHASE}`);
const STATE = path.join(process.cwd(), 'logs', 'e2e', 'state.json');
fs.mkdirSync(DIR, { recursive: true });
if (!EMAIL) throw new Error('set E2E_EMAIL');
// Where a log-in lands: Today (/drills, or /drills/start before training is set up) since Matt's one navigation bar
// (13 Nov); /home (the cases) before it.
const SIGNED_IN_HOME = /\/(home|drills)(\/|\?|$)/;
const CODES = (process.env.CLUB_CODES ?? '').split(',').map(s => s.trim()).filter(Boolean);   // never printed

type Result = { step: string; ok: boolean; detail: string };
const results: Result[] = [];
let shot = 0;
async function check(page: Page, step: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) ?? '';
    results.push({ step, ok: true, detail });
    console.log(`  ✓ ${step}${detail ? ` — ${detail}` : ''}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message.split('\n')[0] : String(err);
    results.push({ step, ok: false, detail });
    console.log(`  ✗ ${step} — ${detail}`);
  }
  await page.screenshot({ path: path.join(DIR, `${String(++shot).padStart(2, '0')}-${step.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`), fullPage: true }).catch(() => {});
}
const text = (page: Page) => page.locator('main').innerText();
async function expectText(page: Page, re: RegExp, timeout = 15_000): Promise<string> {
  await page.getByText(re).first().waitFor({ timeout });
  return (await page.getByText(re).first().innerText()).slice(0, 140);
}
async function logIn(page: Page, password: string) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByPlaceholder('Email').fill(EMAIL);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}
async function signOut(page: Page) {
  await page.context().clearCookies();
}

async function phaseA(page: Page) {
  const p1 = `Test-${Math.random().toString(36).slice(2, 10)}-1`;
  const p2 = `Test-${Math.random().toString(36).slice(2, 10)}-2`;
  fs.writeFileSync(STATE, JSON.stringify({ password: p2 }));
  if (CODES.length < 1) throw new Error('no CLUB_CODES');

  await check(page, 'home page loads', async () => {
    const res = await page.goto(BASE);
    if (res?.status() !== 200) throw new Error(`status ${res?.status()}`);
    return `title "${await page.title()}"`;
  });
  await check(page, 'sign-up: bad club code refused', async () => {
    await page.goto(`${BASE}/sign-up`);
    await page.getByPlaceholder('Email').fill(EMAIL);
    await page.getByPlaceholder(/^Password/).fill(p1);
    await page.getByPlaceholder('Club code').fill('NOT-A-CODE');
    await page.getByRole('button', { name: 'Create account' }).click();
    return expectText(page, /club code isn't valid/);
  });
  await check(page, 'sign-up: short password blocked in the form', async () => {
    await page.getByPlaceholder(/^Password/).fill('short');
    await page.getByPlaceholder('Club code').fill(CODES[0]);
    await page.getByRole('button', { name: 'Create account' }).click();
    const invalid = await page.getByPlaceholder(/^Password/).evaluate(el => !(el as HTMLInputElement).checkValidity());
    if (!invalid || !page.url().includes('/sign-up')) throw new Error('form submitted a short password');
    return 'browser refused to submit';
  });
  await check(page, 'sign-up: valid → account created, sent to log in', async () => {
    await page.getByPlaceholder(/^Password/).fill(p1);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL(/\/sign-in\?created=1/, { timeout: 20_000 });
    return expectText(page, /Account created/);
  });
  await check(page, 'sign-up: same email again → already exists', async () => {
    await page.goto(`${BASE}/sign-up`);
    await page.getByPlaceholder('Email').fill(EMAIL);
    await page.getByPlaceholder(/^Password/).fill(p1);
    await page.getByPlaceholder('Club code').fill(CODES[0]);
    await page.getByRole('button', { name: 'Create account' }).click();
    return expectText(page, /already exists/);
  });
  await check(page, 'log in: wrong password', async () => {
    await logIn(page, 'Wrong-password-123');
    return expectText(page, /Wrong email or password/);
  });
  await check(page, 'log in: right password → home', async () => {
    await logIn(page, p1);
    await page.waitForURL(SIGNED_IN_HOME, { timeout: 20_000 });
    return `at ${new URL(page.url()).pathname}`;
  });
  await check(page, 'account page shows the email', async () => {
    await page.goto(`${BASE}/account`);
    return expectText(page, new RegExp(EMAIL.replace('.', '\\.')));
  });
  await check(page, 'account: bad club code refused', async () => {
    await page.getByPlaceholder('New club code').fill('NOT-A-CODE');
    await page.getByRole('button', { name: 'Change club' }).click();
    return expectText(page, /club code isn't valid/);
  });
  await check(page, 'account: same club → "already your club"', async () => {
    await page.getByPlaceholder('New club code').fill(CODES[0].toLowerCase());
    await page.getByRole('button', { name: 'Change club' }).click();
    return expectText(page, /already your club/);
  });
  if (CODES.length > 1) {
    await check(page, 'account: change club and back', async () => {
      await page.getByPlaceholder('New club code').fill(CODES[1]);
      await page.getByRole('button', { name: 'Change club' }).click();
      await expectText(page, /Done: your club is now/);
      await page.getByPlaceholder('New club code').fill(CODES[0]);
      await page.getByRole('button', { name: 'Change club' }).click();
      await expectText(page, /Done: your club is now/);
      return 'changed twice';
    });
  }
  await check(page, 'account: delete button stays disabled until the email matches', async () => {
    await page.getByRole('button', { name: 'Delete my account…' }).click();
    await page.locator('form input[type=email]').fill('someone-else@example.com');
    if (await page.getByRole('button', { name: 'Delete my account', exact: true }).isEnabled()) throw new Error('enabled with a wrong email');
    await page.getByRole('button', { name: 'Cancel' }).click();
    return 'disabled';
  });

  await signOut(page);
  await check(page, 'forgot password: no account → said plainly', async () => {
    await page.goto(`${BASE}/sign-in`);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.waitForURL(/\/forgot-password/);
    await page.getByPlaceholder('Email').fill(`nobody-${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    return expectText(page, /No account uses this email/);
  });
  await check(page, 'forgot password: malformed email', async () => {
    await page.getByPlaceholder('Email').fill('a@b');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    return expectText(page, /Enter a valid email address/);
  });

  let link = '';
  await check(page, 'reset script makes a link', async () => {
    const out = execFileSync('npx', ['tsx', '--conditions=react-server', '--env-file=.env.local', 'scripts/password-reset-link.ts', EMAIL, `--site=${BASE}`], { encoding: 'utf8' });
    link = out.match(/https?:\/\/\S+auth\/confirm\S+/)?.[0] ?? '';
    if (!link) throw new Error('no link printed');
    return 'link printed';
  });
  await check(page, 'reset link → reset page', async () => {
    await page.goto(link);
    await page.waitForURL(/\/reset-password/, { timeout: 20_000 });
    return 'signed in for the reset';
  });
  await check(page, 'reset: passwords that differ', async () => {
    await page.getByPlaceholder(/^New password/).fill(p2);
    await page.getByPlaceholder('Type it again').fill(p2 + 'x');
    await page.getByRole('button', { name: 'Set new password' }).click();
    return expectText(page, /don't match/);
  });
  await check(page, 'reset: same as the old password', async () => {
    await page.getByPlaceholder(/^New password/).fill(p1);
    await page.getByPlaceholder('Type it again').fill(p1);
    await page.getByRole('button', { name: 'Set new password' }).click();
    return expectText(page, /different from your old one/);
  });
  await check(page, 'reset: new password saved → home', async () => {
    await page.getByPlaceholder(/^New password/).fill(p2);
    await page.getByPlaceholder('Type it again').fill(p2);
    await page.getByRole('button', { name: 'Set new password' }).click();
    await page.waitForURL(SIGNED_IN_HOME, { timeout: 20_000 });
    return 'password changed';
  });
  await signOut(page);
  await check(page, 'old password no longer works', async () => {
    await logIn(page, p1);
    return expectText(page, /Wrong email or password/);
  });
  await check(page, 'new password works', async () => {
    await logIn(page, p2);
    await page.waitForURL(SIGNED_IN_HOME, { timeout: 20_000 });
    return 'home';
  });
  await signOut(page);
  await check(page, 'used reset link → expired notice', async () => {
    await page.goto(link);
    await page.waitForURL(/\/forgot-password\?expired=1/, { timeout: 20_000 });
    return expectText(page, /expired or was already used/);
  });
  await check(page, 'reset page signed out → expired notice', async () => {
    await page.goto(`${BASE}/reset-password`);
    await page.waitForURL(/\/forgot-password\?expired=1/);
    return 'redirected';
  });
  await check(page, 'bad confirmation link → log in with notice', async () => {
    await page.goto(`${BASE}/auth/confirm?token_hash=bogus&type=email`);
    await page.waitForURL(/\/sign-in\?link_expired=1/);
    return expectText(page, /confirmation link has expired/);
  });
  await check(page, 'signed out: /home and /account ask to log in', async () => {
    for (const p of ['/home', '/account']) {
      await page.goto(`${BASE}${p}`);
      if (!/\/sign-in/.test(page.url())) throw new Error(`${p} → ${page.url()}`);
    }
    return 'both redirect to /sign-in';
  });

  await logIn(page, p2);
  await page.waitForURL(SIGNED_IN_HOME, { timeout: 20_000 });
  await check(page, 'unknown page → 404 page', async () => {
    const res = await page.goto(`${BASE}/no-such-page`);
    if (res?.status() !== 404) throw new Error(`status ${res?.status()}`);
    return (await text(page)).slice(0, 80).replace(/\s+/g, ' ');
  });
  await check(page, 'malformed and unknown interview ids → 404', async () => {
    for (const p of ['/case/not-a-uuid', '/case/51111111-1111-4111-8111-111111111111/report']) {
      const res = await page.goto(`${BASE}${p}`);
      if (res?.status() !== 404) throw new Error(`${p}: status ${res?.status()}`);
    }
    return 'both 404';
  });
  await check(page, 'home lists the cases', async () => {
    await page.goto(`${BASE}/home`);
    return (await text(page)).slice(0, 160).replace(/\s+/g, ' ');
  });
  await check(page, 'drills page loads', async () => {
    const res = await page.goto(`${BASE}/drills`);
    if ((res?.status() ?? 500) >= 400) throw new Error(`status ${res?.status()}`);
    return `${new URL(page.url()).pathname}: ${(await text(page)).slice(0, 120).replace(/\s+/g, ' ')}`;
  });
  await check(page, 'demo start page offers voice and text', async () => {
    await page.goto(`${BASE}/start/prof-001-demo`);
    return expectText(page, /Prefer to type\? Start in text/);
  });
}

// Phase B: a text interview on the demo case (7-minute clock) to its report and PDF. The candidate's lines follow
// the case's own analysis; the reply is picked from what the interviewer last asked. At most MAX_TURNS sends.
const MAX_TURNS = 18;
// In the case's natural order; a reply to a specific question (where a figure came from, sizing, risks) comes first.
// (12 Nov first run: the opener's "recommend how to reverse it" made the candidate recommend on turn 1, then repeat
// one fallback line for nine turns — the interviewer handled it, but the case never closed.)
const ORDER = ['clarify', 'structure', 'cogs', 'inputs', 'prices', 'recommend'] as const;
const LINES: Record<string, string> = {
  clarify: "Thanks. Before I structure it, two quick clarifying questions: has the number of stores changed over the two years, and is the goal to get back to the 24% margin?",
  structure: "I'd break profit into revenue and costs. Revenue: number of stores, transactions per store and average ticket. Costs: cost of goods (beans, dairy, packaging, food), then labor, then rent and overhead. Revenue grew 15% while margin fell from 24% to 6%, so the problem is almost certainly costs, and I'd start there. Could I see how each cost line has moved as a share of revenue?",
  cogs: "COGS went from 42% to 58% of revenue, which is 16 of the 18 points of margin lost. Labor is flat and overhead is up 2 points, so COGS is the driver. Is it input prices or a change in what we sell? What has happened to bean prices and the other input costs, and do we know how COGS splits between beans and everything else?",
  inputs: "If beans were 25% of COGS two years ago, that's about 10.5% of revenue. Up 40%, beans add about 4.2 points. The other inputs were about 31.5 points of revenue; up 37.5%, they add about 11.8 points. So beans explain only about a quarter of the increase; dairy, packaging and food are most of it. Have menu prices changed?",
  prices: "That's the core issue: menu prices haven't moved in two years while input costs rose roughly 38%, so the margin was squeezed on every input, not just beans.",
  recommend: "My recommendation: raise menu prices selectively, about 8 to 12% on high-margin specialty drinks where demand is less price-sensitive, since prices haven't moved in two years while costs rose about 38%. Pair that with procurement across all inputs: multi-year bean contracts plus renegotiated dairy and packaging. The main risks are customers trading down and competitors not following, so next steps are to test the increase in a few markets, watch traffic and ticket size, and start supplier negotiations now.",
  source: "Fair point: I assumed that figure. I'd confirm it with the client's finance team before relying on it. Could you share the actual number?",
  sizing: "Rough sizing: total revenue is about $480M and costs are 94% of it, about $451M. A 10% price rise with steady volume takes revenue to about $528M with costs unchanged, so profit goes to about $77M, a margin near 14.5%, up from 6%. Pricing recovers roughly 8 to 9 points; procurement has to do the rest to get back toward 24%.",
  risks: "The main risks are customers trading down to cheaper chains and competitors not raising prices. I'd protect against that by raising prices on specialty drinks first, keeping a value option on the menu, and testing in a few markets before rolling out.",
  next1: "The single next step on procurement: put the top three inputs, beans, dairy and cups, out to tender this quarter, aiming for multi-year contracts that cut their cost by 5 to 10%.",
  next2: "Pricing would do more of the work in the first year, since it acts on all revenue at once; procurement savings build more slowly as contracts roll over.",
  done: "That's my answer: price first, then procurement across all inputs, tested in a few markets before rolling out.",
};
function nextLine(asked: string, used: Set<string>): string {
  const fresh = (k: string) => (used.has(k) ? null : k);
  const pick =
    (/come from|based on|given (you|either)|haven't been given|source/i.test(asked) && fresh('source')) ||
    (/how much|size|sizing|show me the math|close the gap|recover/i.test(asked) && fresh('sizing')) ||
    (/risk|trade down|protect|traffic falls/i.test(asked) && fresh('risks')) ||
    (/single next step|what is the next step/i.test(asked) && fresh('next1')) ||
    (/which of the two|more of the work/i.test(asked) && fresh('next2')) ||
    (/recommend|what would you (tell|do|advise)|the ceo/i.test(asked) && used.has('prices') && fresh('recommend')) ||
    ORDER.find(k => !used.has(k)) ||
    (['risks', 'next1', 'next2', 'done'].find(k => !used.has(k))) ||
    'done';
  used.add(pick);
  return LINES[pick];
}
const lastInterviewer = async (page: Page) =>
  (await page.locator('div.justify-start > div.bg-neutral-100').filter({ has: page.locator('.prose') }).last().innerText().catch(() => '')).trim();

async function phaseB(page: Page) {
  const { password } = JSON.parse(fs.readFileSync(STATE, 'utf8')) as { password: string };
  await logIn(page, password);
  await page.waitForURL(SIGNED_IN_HOME, { timeout: 20_000 });
  let sessionId = '';
  await check(page, 'start the demo case in text', async () => {
    await page.goto(`${BASE}/start/prof-001-demo`);
    await page.getByRole('button', { name: 'Prefer to type? Start in text' }).click();
    await page.waitForURL(/\/case\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    sessionId = page.url().split('/case/')[1];
    await page.getByPlaceholder('Type your response…').waitFor();
    return `session ${sessionId.slice(0, 8)}; opener: "${(await lastInterviewer(page)).slice(0, 90)}"`;
  });
  const transcript: string[] = [`I: ${await lastInterviewer(page)}`];
  const used = new Set<string>();
  let turns = 0, ended = false;
  await check(page, 'interview runs to its close', async () => {
    const t0 = Date.now();
    while (turns < MAX_TURNS) {
      const asked = await lastInterviewer(page);
      const line = nextLine(asked, used);
      await page.waitForTimeout(4000);   // reading and thinking
      const input = page.getByPlaceholder('Type your response…');
      await input.fill(line);
      await page.getByRole('button', { name: 'Send' }).click();
      turns++;
      transcript.push(`C: ${line}`);
      await page.waitForFunction(() => {
        const box = document.querySelector('input[placeholder="Type your response…"]') as HTMLInputElement | null;
        return !box || !box.disabled;
      }, undefined, { timeout: 120_000 });
      transcript.push(`I: ${await lastInterviewer(page)}`);
      if (await page.getByText(/Preparing your report|Get my report|Generating your report hit an error/).count()) { ended = true; break; }
      const alert = await page.getByRole('alert').first().innerText().catch(() => '');
      if (alert) transcript.push(`[notice] ${alert}`);
    }
    fs.writeFileSync(path.join(DIR, 'transcript.txt'), transcript.join('\n\n'));
    if (!ended) throw new Error(`not closed after ${turns} turns`);
    return `${turns} candidate turns, closed at ${Math.round((Date.now() - t0) / 1000)} s`;
  });
  await check(page, 'report is prepared', async () => {
    await page.getByRole('link', { name: 'Get my report' }).waitFor({ timeout: 6 * 60_000 });
    await page.getByRole('link', { name: 'Get my report' }).click();
    await page.waitForURL(/\/report$/, { timeout: 30_000 });
    return expectText(page, /Interview Feedback/);
  });
  await check(page, 'report shows ratings and feedback', async () => {
    const body = await text(page);
    const badges = (body.match(/Needs work|Meets the bar|Strong|Meets bar/gi) ?? []).length;
    if (badges < 3) throw new Error(`only ${badges} rating labels`);
    return `${badges} rating labels; ${body.length} characters`;
  });
  await check(page, 'PDF downloads', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Download PDF' }).click(),
    ]);
    const file = path.join(DIR, 'report.pdf');
    await download.saveAs(file);
    const head = fs.readFileSync(file).subarray(0, 5).toString();
    if (head !== '%PDF-') throw new Error(`not a PDF (${head})`);
    return `${Math.round(fs.statSync(file).size / 1024)} KB`;
  });
  await check(page, 'home shows the finished interview', async () => {
    await page.goto(`${BASE}/home`);
    return (await text(page)).match(/Brew & Bean[^\n]*/g)?.slice(0, 2).join(' | ') ?? 'no row';
  });
  fs.writeFileSync(STATE, JSON.stringify({ password, sessionId }));
}

// Phase C: one Framework builder set (written answers, graded by the model), what the run spent, then the account is
// deleted through /account and the login checked gone.
async function phaseC(page: Page) {
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8')) as { password: string; sessionId?: string };
  const { sessionId } = state;
  let { password } = state;
  // B's account may already be gone (an earlier C run deleted it): sign up again, confirmed at once (no email key here).
  await logIn(page, password);
  if (!(await page.waitForURL(SIGNED_IN_HOME, { timeout: 15_000 }).then(() => true, () => false))) {
    password = `Test-${Math.random().toString(36).slice(2, 10)}-3`;
    fs.writeFileSync(STATE, JSON.stringify({ password, sessionId }));
    await check(page, 'sign up again for the drill', async () => {
      await page.goto(`${BASE}/sign-up`);
      await page.getByPlaceholder('Email').fill(EMAIL);
      await page.getByPlaceholder(/^Password/).fill(password);
      await page.getByPlaceholder('Club code').fill(CODES[0]);
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL(/\/sign-in\?created=1/, { timeout: 20_000 });
      await logIn(page, password);
      await page.waitForURL(SIGNED_IN_HOME, { timeout: 20_000 });
      return 'signed up and logged in';
    });
  }
  await check(page, 'drill: start Framework builder from browse', async () => {
    await page.goto(`${BASE}/drills/browse`);
    await page.getByRole('button', { name: 'Start Framework builder' }).click();
    await page.getByRole('button', { name: /^(Start|Resume)$/ }).waitFor({ timeout: 20_000 });
    await page.getByRole('button', { name: /^(Start|Resume)$/ }).click();
    await page.getByRole('button', { name: 'Submit answer' }).first().waitFor({ timeout: 20_000 });
    return new URL(page.url()).pathname;
  });
  await check(page, 'drill: answer every item', async () => {
    let answered = 0;
    for (let step = 0; step < 12 && !/\/results/.test(page.url()); step++) {
      const submit = page.getByRole('button', { name: /^(Submit answer|Submit|Next step)$/ }).first();
      const onward = page.getByRole('button', { name: /^(Next item|See results|Finish|See your results)$/ }).or(page.getByRole('link', { name: /^(Next item|See results|See your results)$/ })).first();
      await submit.or(onward).first().waitFor({ timeout: 30_000 }).catch(() => {});
      if (await onward.isVisible().catch(() => false)) { await onward.click(); await page.waitForTimeout(2000); continue; }
      if (!(await submit.isVisible().catch(() => false))) break;
      const buckets = page.getByPlaceholder(/^Bucket \d/);
      const n = await buckets.count();
      const names = ['Customer value and willingness to pay', 'Economics: revenue and costs', 'Competition and risks'];
      const points = ['How value scales with the unit we charge for', 'Revenue per customer under each model', 'What competitors charge and how customers react'];
      for (let i = 0; i < n; i++) await buckets.nth(i).fill(names[i] ?? `Other factor ${i + 1}`);
      const subs = page.getByPlaceholder('A specific thing to look at');
      for (let i = 0; i < await subs.count(); i++) await subs.nth(i).fill(points[i] ?? 'A further thing to check');
      const area = page.locator('textarea:visible');
      for (let i = 0; i < await area.count(); i++) await area.nth(i).fill('I would dig into customer value first, because the pricing unit only works if customers see value growing with it.');
      if (!n && !(await area.count())) { const radio = page.getByRole('radio').first(); if (await radio.count()) await radio.check(); }
      await submit.click();
      answered++;
      await page.waitForTimeout(2000);
    }
    await page.waitForURL(/\/results/, { timeout: 30_000 });
    return `${answered} answers submitted`;
  });
  await check(page, 'drill: results graded', async () => {
    for (let i = 0; i < 36; i++) {
      const h1 = await page.locator('h1').first().innerText().catch(() => '');
      if (/\d+%/.test(h1)) return `${h1}; ${(await text(page)).length} characters of feedback`;
      await page.waitForTimeout(5000);
      await page.reload();
    }
    throw new Error(`not graded after 3 min: ${(await text(page)).slice(0, 160).replace(/\s+/g, ' ')}`);
  });

  // Spend, before the delete clears the links (analytics rows lose their session; drill spend rows their set).
  await check(page, 'spend for this run', async () => {
    const { db } = await import('@/db/client');
    const { sql } = await import('drizzle-orm');
    const { costOf } = await import('@/lib/llm-pricing');
    const [u] = await db.execute<{ id: string }>(sql`select id from auth.users where email = ${EMAIL}`);
    const rows = sessionId ? await db.execute<{ p: Record<string, unknown> }>(sql`select payload_jsonb as p from analytics_events where event_type = 'llm_usage' and session_id = ${sessionId}`) : [];
    let interview = 0;
    for (const r of rows) interview += costOf(r.p as never);
    const [d] = await db.execute<{ usd: number | null; n: number }>(sql`select sum(g.cost_usd)::float usd, count(*)::int n from drill_grading_spend g join drill_sets s on s.id = g.set_id where s.student_id = ${u.id}`);
    return `interview + scoring $${interview.toFixed(3)} (${rows.length} calls); drill grading $${(d.usd ?? 0).toFixed(3)} (${d.n} calls)`;
  });

  await check(page, 'delete the account through /account', async () => {
    await page.goto(`${BASE}/account`);
    await page.getByRole('button', { name: 'Delete my account…' }).click();
    await page.locator('form input[type=email]').fill(EMAIL.toUpperCase());
    await page.getByRole('button', { name: 'Delete my account', exact: true }).click();
    await page.waitForURL(/\/sign-in\?deleted=1/, { timeout: 60_000 });
    return expectText(page, /account and its data have been deleted/);
  });
  await check(page, 'the deleted login no longer works', async () => {
    await logIn(page, password);
    return expectText(page, /Wrong email or password/);
  });
  await check(page, 'nothing personal left in the database', async () => {
    const { db } = await import('@/db/client');
    const { sql } = await import('drizzle-orm');
    const [n] = await db.execute<Record<string, number>>(sql`select
      (select count(*)::int from auth.users where email = ${EMAIL}) logins,
      (select count(*)::int from sessions where id = ${sessionId ?? '00000000-0000-0000-0000-000000000000'}) sessions`);
    if (n.logins || n.sessions) throw new Error(JSON.stringify(n));
    return JSON.stringify(n);
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });   // the installed Chrome: no browser download
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  console.log(`site e2e, phase ${PHASE}, against ${BASE}; screenshots in ${DIR}`);
  try {
    if (PHASE === 'A') await phaseA(page);
    else if (PHASE === 'B') await phaseB(page);
    else if (PHASE === 'C') await phaseC(page);
    else throw new Error(`unknown phase ${PHASE}`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(DIR, 'results.json'), JSON.stringify(results, null, 2));
    const failed = results.filter(r => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map(f => f.step).join('; ')}` : ''}`);
  }
})().then(() => process.exit(0), err => { console.error(err); process.exit(1); });
