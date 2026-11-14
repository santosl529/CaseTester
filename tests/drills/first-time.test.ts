// The first-time-user pass (Matt, 13 Nov): Today's done state and first-week
// card, the pass-mark line, the plain readiness checklist, the skill-state
// descriptions, and Cases' order, first case and disabled starts.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));

import { isFirstWeek, scoreLine, todaySections } from '@/lib/drills/today-page';
import { STATE_DESCRIPTION, difficultyFrom, readiness } from '@/lib/drills/progress/dashboard';
import { SKILL_STATES } from '@/lib/drills/progress/engine';
import { FIRST_CASE_ID, byDifficulty, listedCases } from '@/lib/cases/listed';
import { CaseList, type CaseCard } from '@/components/case-list';

describe('Today: the done-state switch', () => {
  it('keeps the order while the workout is unfinished, the set in progress at the top', () => {
    expect(todaySections({ workoutDone: false, resume: true, quickFix: true, extra: false })).toEqual({ resumeTop: true, optional: [] });
    expect(todaySections({ workoutDone: false, resume: false, quickFix: true, extra: false })).toEqual({ resumeTop: false, optional: [] });
  });
  it('once done, puts the set in progress, the quick fix and extra sets under Optional, in that order', () => {
    expect(todaySections({ workoutDone: true, resume: true, quickFix: true, extra: true })).toEqual({ resumeTop: false, optional: ['resume', 'quick_fix', 'extra'] });
    expect(todaySections({ workoutDone: true, resume: false, quickFix: true, extra: false })).toEqual({ resumeTop: false, optional: ['quick_fix'] });
    expect(todaySections({ workoutDone: true, resume: false, quickFix: false, extra: false })).toEqual({ resumeTop: false, optional: [] });
  });
  it('writes a score with its pass mark', () => {
    expect(scoreLine(0.5, 0.8)).toBe('Score 50% · pass mark 80%');
    expect(scoreLine(0.875, 0.75)).toBe('Score 88% · pass mark 75%');
  });
});

describe('Today: How CasePace works', () => {
  const now = new Date('2026-11-13T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  it('shows in week 0 or 1 of a weekly plan, not after', () => {
    expect(isFirstWeek({ kind: 'weeks', week: 0 }, daysAgo(30), now)).toBe(true);
    expect(isFirstWeek({ kind: 'weeks', week: 1 }, daysAgo(30), now)).toBe(true);
    expect(isFirstWeek({ kind: 'weeks', week: 2 }, daysAgo(1), now)).toBe(false);
  });
  it('otherwise shows for the first 7 days of the program', () => {
    expect(isFirstWeek({ kind: 'days', week: null }, daysAgo(3), now)).toBe(true);
    expect(isFirstWeek({ kind: 'none', week: null }, daysAgo(6.9), now)).toBe(true);
    expect(isFirstWeek({ kind: 'none', week: null }, daysAgo(7), now)).toBe(false);
    expect(isFirstWeek({ kind: 'none', week: null }, null, now)).toBe(false);
  });
});

describe('Progress: plain words', () => {
  it('describes every skill state', () => {
    for (const s of SKILL_STATES) expect(STATE_DESCRIPTION[s].length, s).toBeGreaterThan(10);
  });
  it('names case difficulties instead of tiers', () => {
    expect(difficultyFrom(1)).toBe('Easy, Medium or Hard');
    expect(difficultyFrom(2)).toBe('Medium or Hard');
    expect(difficultyFrom(3)).toBe('Hard');
  });
  it('writes the readiness checklist in plain English', () => {
    const r = readiness(new Map(), ['PS.mece', 'QN.setup'], [], true);
    expect(r.lines[0].text).toMatch(/key skills in your plan at Mastered or above$/);
    expect(r.lines[2].text).toBe('On your last 2 different full cases at Medium or Hard, score at least “adequate” in every area and “strong” in at least half. Only your first attempt at each case counts');
    expect(r.lines[2].detail).toBe('No Medium or Hard cases yet.');
  });
});

describe('Cases', () => {
  it('lists Easy, then Medium, then Hard, keeping the listed order within each', () => {
    const order = byDifficulty(listedCases()).map(c => c.difficulty);
    expect(order).toEqual([...order].sort((a, b) => ['easy', 'medium', 'hard'].indexOf(a) - ['easy', 'medium', 'hard'].indexOf(b)));
    expect(byDifficulty([{ id: 'a', difficulty: 'hard' as const }, { id: 'b', difficulty: 'easy' as const }, { id: 'c', difficulty: 'easy' as const }]).map(c => c.id)).toEqual(['b', 'c', 'a']);
  });
  it('marks an Easy listed case as the good first case', () => {
    const first = listedCases().find(c => c.id === FIRST_CASE_ID);
    expect(first?.difficulty).toBe('easy');
  });
  const cards: CaseCard[] = [
    { id: 'prof-002', title: 'Larkspur', difficulty: 'easy', minutes: 25, done: 0, last: null, first: true },
    { id: 'prof-001', title: 'Brew & Bean', difficulty: 'medium', minutes: 20, done: 0, last: null },
  ];
  const render = (block: boolean) => renderToStaticMarkup(createElement(CaseList, {
    cases: cards,
    left: { n: block ? 0 : 1, scope: 'day', perDay: 2, block: block ? { reason: 'daily', limit: 2, retryAt: '2026-11-14T15:30:00.000Z' } : null },
  }));
  it('disables every Start case button once the limit is reached, and says why', () => {
    const html = render(true);
    expect(html.match(/aria-disabled="true"/g)?.length).toBe(2);
    expect(html).toContain('the most allowed');
    expect(html).toContain('Good first case');
  });
  it('leaves them enabled below the limit', () => {
    expect(render(false)).not.toContain('aria-disabled');
  });
});
