// D6 accessibility audit (docs/prd-drills.md "Accessibility (WCAG 2.1 AA)"):
// signs in as a throwaway student and scans every drills page, a set of every
// live drill, HY-2's second stage, a Defend follow-up and two results pages.
// On each page: axe-core with the WCAG 2.0/2.1 A and AA rules, a keyboard pass
// (Tab through the page; every stop must show a focus indicator) and reflow
// at 320 CSS px (no sideways scrolling, WCAG 1.4.10). Writes
// logs/a11y/<time>.json and prints a summary. Grading uses a stub model: free.
//
//   npm run dev                      (in another terminal)
//   npm run drills:a11y              A11Y_BASE_URL defaults to http://localhost:3000
//
// Automated checks find about a third of WCAG problems. A person still has to
// run the manual checklist in docs/drills-a11y-audit.md (screen reader, zoom).
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { eq, inArray } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { chromium, type Page } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { db } from '@/db/client';
import {
  analyticsEvents, diagnostics, drillAttempts, drillSets, drillTiers, gradingJobs, lessonViews, prescriptions, skillStateEvents, skillStates,
  studentDrillSettings, studentPrograms, studentProfiles, workouts,
} from '@/db/schema';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { enqueueGrading, planOf, resolveItem, runGradingJob } from '@/lib/drills/grading/jobs';
import type { CallModel } from '@/lib/drills/grading/grader';
import type { Tier } from '@/lib/drills/item-schema';
import { completeSet, fetchItem, inProgressSet, startSet, submitAttempt } from '@/lib/drills/sets/service';
import { onboard } from '@/lib/drills/program/store';

const BASE = process.env.A11Y_BASE_URL ?? 'http://localhost:3000';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const MAX_TABS = 60;
// Screenshots of each page (desktop width), for the manual review.
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const SHOTS = path.join(process.cwd(), 'logs', 'a11y', RUN);

interface PageResult {
  page: string;
  url: string;
  violations: { rule: string; impact: string | null; help: string; nodes: { target: string; html: string }[] }[];
  // Tab stops in order, and those with no visible focus indicator.
  stops: string[];
  no_focus_ring: string[];
  tab_stops: number;
  // Wider than the 320 px viewport (sideways scrolling).
  reflow_overflow_px: number;
  error?: string;
}
const results: PageResult[] = [];

// Every check fails, nothing flagged: enough to render a graded results page.
const stubGrader: CallModel = async (_system, user) => {
  const key = /<item key="([^"]+)"/.exec(user)?.[1] ?? 'a1';
  const checks = [...user.matchAll(/check_id "([^"]+)"/g)].map(m => ({ check_id: m[1], pass: false, evidence: '' }));
  const red_flags = [...user.matchAll(/- id "([^"]+)"/g)].map(m => ({ id: m[1], present: false, evidence: '' }));
  return {
    output: { items: [{ item_key: key, checks, red_flags, hypothesis_family: null, backup_family: null, injection_suspected: false }] },
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  };
};

// Runs in the page (a string, so the bundler adds no helpers): the focused
// element, and whether it or a wrapper (has-focus-visible) draws a ring.
const FOCUS_PROBE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  // Back at the first stop: the walk has wrapped around. Another repeat is a
  // control with parts (a date field's month, day and year), not a new stop.
  if (el.hasAttribute('data-a11y-first')) return { wrapped: true };
  if (el.hasAttribute('data-a11y-seen')) return { repeat: true };
  if (!document.querySelector('[data-a11y-first]')) el.setAttribute('data-a11y-first', '');
  el.setAttribute('data-a11y-seen', '');
  const label = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '') + ' "' + (el.textContent || '').trim().slice(0, 40) + '"';
  let ring = false;
  for (let n = el, depth = 0; n && depth < 3; n = n.parentElement, depth++) {
    const s = getComputedStyle(n);
    if ((s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')) { ring = true; break; }
  }
  return { label, ring };
})()`;

// Tab from the top of the page; record each stop and whether it shows focus.
async function keyboardPass(page: Page): Promise<{ stops: number; list: string[]; noRing: string[] }> {
  // Start from the top: a click on the page corner (an autofocused field
  // would otherwise make Tab start after it).
  await page.evaluate('window.scrollTo(0, 0)');
  await page.mouse.click(2, 2);
  const noRing: string[] = [];
  let stops = 0;
  const list: string[] = [];
  for (let i = 0; i < MAX_TABS; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(FOCUS_PROBE) as { wrapped?: true; repeat?: true; label: string; ring: boolean } | null;
    if (!stop || stop.wrapped) break;
    if (stop.repeat) continue;
    // The Next.js dev overlay (development only).
    if (stop.label.startsWith('nextjs-portal')) continue;
    stops++;
    list.push(stop.label);
    if (!stop.ring) noRing.push(stop.label);
  }
  return { stops, list, noRing };
}

async function scan(page: Page, name: string, url: string, ready?: (p: Page) => Promise<unknown>) {
  const result: PageResult = { page: name, url, violations: [], stops: [], no_focus_ring: [], tab_stops: 0, reflow_overflow_px: 0 };
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    if (ready) await ready(page);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${results.length + 1}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`), fullPage: true });
    const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    result.violations = axe.violations.map(v => ({
      rule: v.id, impact: v.impact ?? null, help: v.help,
      nodes: v.nodes.slice(0, 5).map(n => ({ target: n.target.join(' '), html: n.html.slice(0, 160) })),
    }));
    const kb = await keyboardPass(page);
    result.tab_stops = kb.stops;
    result.stops = kb.list;
    result.no_focus_ring = kb.noRing;
    await page.setViewportSize({ width: 320, height: 800 });
    await page.waitForTimeout(300);
    result.reflow_overflow_px = await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth') as number;
  } catch (e) {
    result.error = e instanceof Error ? e.message.split('\n')[0] : String(e);
  }
  results.push(result);
  const issues = result.violations.length + result.no_focus_ring.length + (result.reflow_overflow_px > 0 ? 1 : 0);
  console.log(`${issues || result.error ? '✗' : '✓'} ${name}: ${result.violations.length} axe rule(s), ${result.no_focus_ring.length}/${result.tab_stops} stops without a focus ring, overflow ${result.reflow_overflow_px}px${result.error ? `, error: ${result.error}` : ''}`);
}

// A set opens on its intro screen; Start (or Resume) shows the item, ready
// once its Submit button is there.
const introReady = (p: Page) => p.getByRole('button', { name: /^(Start|Resume)$/ }).waitFor({ timeout: 15_000 });
const setReady = async (p: Page) => {
  await introReady(p);
  await p.getByRole('button', { name: /^(Start|Resume)$/ }).click();
  await p.getByRole('button', { name: /^(Submit|Next step|Submit answer)$/ }).first().waitFor({ timeout: 15_000 });
};

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed (from .env.local)');
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `a11y-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`could not create the test user: ${error?.message}`);
  const student = created.user.id;
  const browser = await chromium.launch();
  try {
    await db.insert(studentProfiles).values({ userId: student, orgId: 'a11y-test', timezone: 'America/New_York' });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill(password);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByPlaceholder('Club code').waitFor({ timeout: 15_000 });

    // Before onboarding: the onboarding form.
    await scan(page, 'Onboarding', '/drills/start', p => p.waitForSelector('main form', { timeout: 15_000 }));
    await onboard(student, { wants_plan: true, interview_date: null, cases_done: '1-5', availability: 'standard', timezone: 'America/New_York' });

    await scan(page, 'Training home', '/drills');
    await scan(page, 'Diagnostic', '/drills/diagnostic');
    await scan(page, 'Browse drills', '/drills/browse');
    await scan(page, 'Learn library', '/drills/learn');
    await scan(page, 'Lesson: How a case interview works', '/drills/learn/intro');
    await scan(page, 'Lesson: MECE (full)', '/drills/learn/PS.mece');
    await scan(page, 'Your skills', '/drills/profile');
    await scan(page, 'Settings', '/drills/settings');

    const expire = async (setId: string) => {
      await db.update(drillSets).set({ startedAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(drillSets.id, setId));
      await inProgressSet(student);
    };
    for (const [i, drill] of DRILLS_CONFIG.drills.drills.filter(d => d.live).entries()) {
      const { set_id } = await startSet(student, { drill_id: drill.id });
      if (i === 0) await scan(page, `Set intro: ${drill.id} (with worked example)`, `/drills/sets/${set_id}`, introReady);
      await scan(page, `Set: ${drill.id} ${drill.name}`, `/drills/sets/${set_id}`, setReady);
      await expire(set_id);
    }

    // HY-2 stage 2: the new fact revealed, after stage 1.
    {
      const { set_id } = await startSet(student, { drill_id: 'HY-2' });
      await fetchItem(student, set_id, 0);
      await submitAttempt(student, set_id, { position: 0, idempotency_key: 'a11y-hy2', step: 0, skip: false, timed_out: false, response: { type: 'text', value: 'Probably fewer repeat customers; I would test it with repeat orders by month.' } });
      await scan(page, 'Set: HY-2 stage 2 (new fact)', `/drills/sets/${set_id}`, setReady);
      await expire(set_id);
    }

    // A Defend follow-up (tier 2): the main answer submitted, the follow-up showing.
    {
      const { set_id } = await startSet(student, { drill_id: 'CL-3', tier: 2, browse: true });
      const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
      const position = planOf(set).findIndex(r => r.kind === 'authored' && r.defend);
      if (position < 0) {
        console.log('✗ Defend follow-up: no follow-up item in a tier 2 CL-3 set');
      } else {
        for (let p = 0; p <= position; p++) {
          await fetchItem(student, set_id, p);
          await submitAttempt(student, set_id, { position: p, idempotency_key: `a11y-cl3-${p}`, step: 0, skip: false, timed_out: false, response: { type: 'text', value: 'Profit is revenue minus costs. I would start with cost per order by month for two years, since costs rose.' } });
        }
        await scan(page, 'Set: CL-3 Defend follow-up', `/drills/sets/${set_id}`, setReady);
      }
      await expire(set_id);
    }

    // Results: an auto-checked set (PS-1) and an AI-graded one (CL-3, stub grader).
    {
      const { set_id } = await startSet(student, { drill_id: 'PS-1' });
      const [set] = await db.select().from(drillSets).where(eq(drillSets.id, set_id));
      for (let p = 0; p < set.size; p++) {
        await fetchItem(student, set_id, p);
        const item = await resolveItem(planOf(set)[p], set.tier as Tier);
        const right = item.options.find(o => o.correct)!;
        const wrong = item.options.find(o => !o.correct)!;
        await submitAttempt(student, set_id, { position: p, idempotency_key: `a11y-ps1-${p}`, step: 0, skip: false, timed_out: false, response: { type: 'choice', option_id: (p % 2 ? wrong : right).id } });
      }
      await completeSet(student, set_id);
      await scan(page, 'Results: PS-1', `/drills/sets/${set_id}/results`);
    }
    {
      const { set_id } = await startSet(student, { drill_id: 'CL-3' });
      for (let p = 0; ; p++) {
        try { await fetchItem(student, set_id, p); } catch { break; }
        await submitAttempt(student, set_id, { position: p, idempotency_key: `a11y-cl3r-${p}`, step: 0, skip: false, timed_out: false, response: { type: 'text', value: 'I would look at revenue and costs, starting with costs.' } });
      }
      await runGradingJob(await enqueueGrading(set_id), stubGrader);
      await scan(page, 'Results: CL-3 (graded)', `/drills/sets/${set_id}/results`);
    }
  } finally {
    await browser.close();
    const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, student));
    const ids = sets.map(s => s.id);
    if (ids.length) {
      await db.delete(gradingJobs).where(inArray(gradingJobs.setId, ids));
      await db.delete(drillAttempts).where(inArray(drillAttempts.setId, ids));
      await db.delete(drillSets).where(inArray(drillSets.id, ids));
    }
    await db.delete(workouts).where(eq(workouts.studentId, student));
    await db.delete(studentPrograms).where(eq(studentPrograms.studentId, student));
    await db.delete(diagnostics).where(eq(diagnostics.studentId, student));
    for (const t of [prescriptions, skillStateEvents, skillStates, drillTiers, studentDrillSettings, lessonViews]) await db.delete(t).where(eq(t.studentId, student));
    await db.delete(studentProfiles).where(eq(studentProfiles.userId, student));
    await new Promise(r => setTimeout(r, 1500));
    await db.delete(analyticsEvents).where(eq(analyticsEvents.userId, student));
    await admin.auth.admin.deleteUser(student);
    console.log(`cleaned up test student ${student}`);
  }

  const dir = path.join(process.cwd(), 'logs', 'a11y');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${RUN}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));

  const byRule = new Map<string, { help: string; impact: string | null; pages: string[] }>();
  for (const r of results) for (const v of r.violations) {
    const e = byRule.get(v.rule) ?? { help: v.help, impact: v.impact, pages: [] };
    e.pages.push(r.page);
    byRule.set(v.rule, e);
  }
  console.log(`\naxe rules failed: ${byRule.size}`);
  for (const [rule, e] of byRule) console.log(`- ${rule} (${e.impact}): ${e.help} — ${e.pages.length} page(s): ${e.pages.join('; ')}`);
  console.log(`pages with stops lacking a focus ring: ${results.filter(r => r.no_focus_ring.length).length}`);
  console.log(`pages that scroll sideways at 320px: ${results.filter(r => r.reflow_overflow_px > 0).length}`);
  console.log(`pages that failed to load: ${results.filter(r => r.error).length}`);
  console.log(`\nfull results: ${path.relative(process.cwd(), file)}`);
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
