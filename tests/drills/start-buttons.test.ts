// Clicking a drill starts that drill (Matt, 21 Nov). Every Start / Practice / Try it / Retry button goes through
// useStartSet: it opens the set it started, or, while another set is unfinished, asks (Resume it, or Start the
// clicked drill instead) — never a different set without asking. Each page's buttons send the request for their own
// drill. The server side (set aside, resume, the same-target rule, races) runs against the database in
// `npm run drills:smoke:unfinished`.
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/drills', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/db/client', () => ({ db: {} }));
// Each start button renders as a marker carrying the request it would send.
const marker = (kind: string, label: string, body: unknown) => `[[${kind}|${label}|${JSON.stringify(body)}]]`;
vi.mock('@/components/drills/start-set-button', () => ({ StartSetButton: (p: { body: unknown; label: string }) => marker('start', p.label, p.body) }));
vi.mock('@/components/drills/prescription-actions', () => ({ PrescriptionActions: (p: { id: string; extra?: object; startLabel?: string }) => marker('prescription', p.startLabel ?? 'Start', { prescription_id: p.id, ...p.extra }) }));
vi.mock('@/components/drills/lesson-actions', () => ({
  LessonActions: (p: { start: object; skippable: boolean }) => marker('lesson', 'Try it', p.start) + (p.skippable ? marker('lesson', 'Skip the lesson', p.start) : ''),
  IntroLessonActions: () => '',
}));
vi.mock('@/components/drills/retry-button', () => ({ RetryButton: (p: { drillId: string; skillId: string | null }) => marker('retry', 'Retry this drill', { drill_id: p.drillId, ...(p.skillId && { skill_id: p.skillId }) }) }));

import { DRILL_SCREENS } from '@/app/dev/ui-preview/_data/drills';
import { CASE_SCREENS } from '@/app/dev/ui-preview/_data/case';
import { SET_SCREENS } from '@/app/dev/ui-preview/_data/sets';
import {
  UNFINISHED_TITLE, UnfinishedSetDialog, insteadLabel, isUnfinished, resumeLabel, startOutcome, unfinishedLine, unfinishedNote, type Unfinished,
} from '@/components/drills/use-start-set';

const SCREENS = [...DRILL_SCREENS, ...CASE_SCREENS, ...SET_SCREENS];
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
function buttons(slug: string) {
  const screen = SCREENS.find(s => s.slug === slug);
  if (!screen) throw new Error(`no preview screen ${slug}`);
  const html = decode(renderToStaticMarkup((screen.render() as { node: ReactNode }).node));
  return [...html.matchAll(/\[\[(\w+)\|([^|]*)\|(\{.*?\})\]\]/g)].map(m => ({ kind: m[1], label: m[2], body: JSON.parse(m[3]) as Record<string, unknown> }));
}
const find = (slug: string, label: string | RegExp) => {
  const b = buttons(slug).find(x => (typeof label === 'string' ? x.label === label : label.test(x.label)));
  if (!b) throw new Error(`${slug}: no "${label}" button (has: ${buttons(slug).map(x => x.label).join(', ')})`);
  return b;
};

const MENTAL_MATH: Unfinished = {
  set_id: '11111111-1111-4111-8111-111111111111', drill_name: 'Mental math', done: 2, size: 6, workout: true, diagnostic: false,
  wanted: { drill_name: 'Pick the best hypothesis' },
};

describe('the answer to a start', () => {
  it('opens the set it started', () => {
    expect(startOutcome(true, { set_id: 'abc' }, 'x')).toEqual({ kind: 'open', set_id: 'abc' });
    expect(startOutcome(true, { set_id: 'abc', resumed: true }, 'x')).toEqual({ kind: 'open', set_id: 'abc' });
  });
  it('asks when another set is unfinished: never opens it silently', () => {
    const out = startOutcome(false, { error: 'set_in_progress', message: 'Finish or leave your current set first', ...MENTAL_MATH }, 'x');
    expect(out).toEqual({ kind: 'ask', unfinished: expect.objectContaining({ set_id: MENTAL_MATH.set_id, drill_name: 'Mental math' }) });
  });
  it('an old-style 409 with only an id is an error, not a redirect', () => {
    expect(startOutcome(false, { error: 'set_in_progress', message: 'Finish or leave your current set first', set_id: 'old' }, 'x'))
      .toEqual({ kind: 'error', message: 'Finish or leave your current set first' });
    expect(isUnfinished({ error: 'set_in_progress', set_id: 'old' })).toBe(false);
  });
  it('other errors show their message, or the fallback', () => {
    expect(startOutcome(false, { error: 'grading_cap', message: 'You have 2 left today' }, 'x')).toEqual({ kind: 'error', message: 'You have 2 left today' });
    expect(startOutcome(false, {}, 'Could not start the set.')).toEqual({ kind: 'error', message: 'Could not start the set.' });
  });
});

describe('the choice (text approved by Matt, 21 Nov)', () => {
  const render = (u: Unfinished, error = '') => renderToStaticMarkup(createElement(UnfinishedSetDialog, { unfinished: u, busy: false, error, onResume: () => {}, onInstead: () => {}, onCancel: () => {} }));
  it('names the unfinished set and the clicked drill', () => {
    expect(UNFINISHED_TITLE).toBe('You have an unfinished set');
    expect(unfinishedLine(MENTAL_MATH)).toBe('Mental math · 2 of 6 done');
    expect(resumeLabel(MENTAL_MATH)).toBe('Resume Mental math');
    expect(insteadLabel(MENTAL_MATH)).toBe('Start Pick the best hypothesis instead');
    const html = decode(render(MENTAL_MATH));
    for (const t of ['You have an unfinished set', 'Mental math · 2 of 6 done', 'Resume Mental math', 'Start Pick the best hypothesis instead', 'Cancel']) expect(html).toContain(t);
    // Resume is the primary button, first.
    expect(html.indexOf('Resume Mental math')).toBeLessThan(html.indexOf('Start Pick the best hypothesis instead'));
  });
  it('says where the set will be: the workout, or Today', () => {
    expect(unfinishedNote({ workout: true })).toBe('Your answers are saved. Today’s workout picks it up where you left off.');
    expect(unfinishedNote({ workout: false })).toBe('Your answers are saved. Resume it any time from Today.');
    expect(decode(render({ ...MENTAL_MATH, workout: false }))).toContain('Resume it any time from Today.');
  });
  it('is a labelled modal dialog, and shows a failed start inside it', () => {
    const html = render(MENTAL_MATH, 'You have 2 left today');
    expect(html).toMatch(/^<dialog[^>]*aria-labelledby="[^"]+-title"[^>]*aria-describedby="[^"]+-body [^"]+-note"/);
    expect(html).toMatch(/role="alert"[^>]*>You have 2 left today/);
  });
});

describe('every start button asks instead of redirecting', () => {
  const dir = path.join(process.cwd(), 'components');
  const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  it('only useStartSet posts to /api/drills/sets', () => {
    const posting = files(dir).filter(f => /['"`]\/api\/drills\/sets['"`]/.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(dir, f));
    expect(posting).toEqual(['drills/use-start-set.tsx']);
  });
  it('no component opens the set a refusal names', () => {
    for (const f of files(dir).filter(x => !x.endsWith('use-start-set.tsx'))) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/set_in_progress'\)?\s*\)?\s*router\.push|error === 'set_in_progress'/);
  });
  // Found 21 Nov by the accessibility pass: Today and the set page are server components, and calling a function from a
  // 'use client' module there crashes the page. The text lives in lib/drills/unfinished-text.ts.
  it('server pages take the choice text from the plain module, not the client hook', () => {
    for (const f of ['views/training-home.tsx', 'views/set.tsx']) {
      const src = fs.readFileSync(path.join(dir, 'drills', f), 'utf8');
      expect(src, f).not.toMatch(/^'use client'/);
      expect(src, f).not.toMatch(/from '@\/components\/drills\/use-start-set'/);
    }
    expect(fs.readFileSync(path.join(process.cwd(), 'lib/drills/unfinished-text.ts'), 'utf8')).not.toMatch(/'use client'/);
  });
  it.each(['start-set-button.tsx', 'prescription-actions.tsx', 'lesson-actions.tsx', 'retry-button.tsx'])('%s starts through useStartSet', f => {
    expect(fs.readFileSync(path.join(dir, 'drills', f), 'utf8')).toMatch(/useStartSet\(/);
  });
});

describe('each page starts the drill its button names', () => {
  it("Today: Start today's workout starts that block", () => {
    expect(find('training-home-first', "Start today's workout").body).toEqual({ workout_id: 'preview-workout', block: 0 });
  });
  it('Today: Continue workout resumes its block (its set in progress or set aside), not some other set', () => {
    expect(find('training-home', 'Continue workout').body).toEqual({ workout_id: 'preview-workout', block: 1 });
  });
  it('Today: the quick practice starts its skill', () => {
    expect(find('training-home', /^Practice arithmetic/).body).toEqual({ skill_id: 'QN.arithmetic', quick_start: true });
  });
  it('Today: Suggested next starts its skill', () => {
    expect(buttons('training-home-self').find(b => b.body.suggestion)?.body).toEqual(expect.objectContaining({ skill_id: 'QN.setup', quick_start: true }));
  });
  it('Today, once the workout is done: an extra set starts its own drill', () => {
    expect(find('training-home-done', 'Start Sanity check').body).toEqual(expect.objectContaining({ drill_id: 'QN-2', skill_id: 'QN.percentages' }));
  });
  it("Today: an Unfinished row resumes that set", () => {
    const html = decode(renderToStaticMarkup((DRILL_SCREENS.find(s => s.slug === 'training-home')!.render() as { node: ReactNode }).node));
    expect(html).toMatch(/Unfinished: <span[^>]*>Mental math · 2 of 6 done<\/span>/);
    expect(find('training-home', 'Resume').body).toEqual({ resume_set_id: 'preview-aside' });
  });
  it('Your plan: Start first workout starts block 0', () => {
    expect(find('plan', 'Start first workout').body).toEqual({ workout_id: 'preview-workout', block: 0 });
  });
  it('Browse: Practice starts its skill, Start (pick exactly) its drill', () => {
    expect(buttons('browse-idle').filter(b => b.label === 'Practice').every(b => b.body.quick_start === true && b.body.browse === true && typeof b.body.skill_id === 'string')).toBe(true);
    const picks = buttons('browse-idle').filter(b => b.label === 'Start');
    expect(picks.length).toBeGreaterThan(10);
    expect(picks.find(b => b.body.drill_id === 'HY-1')?.body).toEqual(expect.objectContaining({ skill_id: 'HY.form', browse: true }));
  });
  it('a skill page: Practice this starts that skill', () => {
    expect(find('skill', 'Practice this').body).toEqual({ skill_id: 'EX.takeaway', quick_start: true, dashboard: 'detail' });
  });
  it('Your progress: Practice starts that focus area', () => {
    const b = buttons('progress').filter(x => x.kind === 'prescription');
    expect(b.length).toBeGreaterThan(0);
    expect(b.every(x => typeof x.body.prescription_id === 'string' && x.body.dashboard === 'focus')).toBe(true);
  });
  it('the diagnostic: Start and Continue part start their part', () => {
    expect(find('diagnostic-start', 'Start the diagnostic').body).toEqual({ diagnostic_part: 0 });
    expect(find('diagnostic', /^Continue part 3 of/).body).toEqual({ diagnostic_part: 2 });
  });
  it("the report's next steps: Start practice starts that skill's prescription", () => {
    const b = buttons('report-next-steps').filter(x => x.label === 'Start practice');
    expect(b.length).toBeGreaterThan(0);
    for (const x of b) expect(x.body).toEqual({ prescription_id: expect.any(String), report: { case_attempt_id: expect.any(String), skill_id: expect.any(String) } });
  });
  it('a lesson: Try it (and Skip, when it opened by itself) starts the lesson\'s skill', () => {
    expect(find('lesson', 'Try it').body).toEqual({ skill_id: 'EX.takeaway', quick_start: true });
    expect(find('lesson-full', 'Skip the lesson').body).toEqual({ skill_id: 'EX.takeaway', quick_start: true });
  });
  it('set results: Retry this drill retries that drill', () => {
    expect(buttons('drill-results').find(b => b.kind === 'retry')?.body.drill_id).toEqual(expect.any(String));
  });
});
