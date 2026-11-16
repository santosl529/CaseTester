import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { CaseNextSteps } from '@/components/case-next-steps';
import type { NextStepsView } from '@/lib/drills/progress/report-view';
import type { NextStepsSnapshot } from '@/lib/drills/next-steps';

const ID = '00000000-0000-4000-8000-0000000000aa';
const skill = (skill_id: string, name: string, minutes: number) => ({
  skill_id, name, why: 'You made an arithmetic slip.', quote: 'two times three is five', prescription_id: '00000000-0000-4000-8000-0000000000b1',
  lesson: { minutes: 3 }, practice: { drill_name: 'Mental math', level: 2, minutes },
});
const snap = (o: Partial<NextStepsSnapshot> = {}): NextStepsSnapshot => ({ version: 1, skills: [skill('QN.arithmetic', 'Arithmetic', 8), skill('PS.mece', 'MECE structure', 10)], also: null, all_clear: false, partial: false, retake: false, ...o });
const view = (o: Partial<Extract<NextStepsView, { state: 'ready' }>> = {}): NextStepsView =>
  ({ state: 'ready', caseAttemptId: ID, snapshot: snap(), done: [], ready: false, minutes: 24, nextCase: { title: 'Brew & Bean Profitability', difficulty: 'Medium' }, strengths: [], ...o });
const html = (v: NextStepsView) => renderToStaticMarkup(createElement(CaseNextSteps, { view: v, sessionId: ID }));

describe('Your next steps on the report (Matt, 15 Nov)', () => {
  it('shows "done" only for a skill drill results marked done', () => {
    const h = html(view({ done: ['QN.arithmetic'] }));
    expect(h).toContain('Arithmetic: passed a set');
    expect(h).toContain('MECE structure: pass one set');
    expect(h).toContain('When both are done, try');
  });
  it('makes only the first Start practice the primary button, each named with its skill and time', () => {
    const h = html(view());
    expect(h).toContain('aria-label="Start practice: Arithmetic, about 8 minutes"');
    expect(h).toContain('aria-label="Start practice: MECE structure, about 10 minutes"');
    expect(h.match(/bg-primary|bg-cobalt text-white/g)?.length ?? 0).toBeGreaterThan(0);
    expect(h).toContain('Mental math · Level 2 · about 8 min');
  });
  it('says ready, all clear, ended early and all taken in the approved words', () => {
    expect(html(view({ ready: true, done: ['QN.arithmetic', 'PS.mece'] }))).toContain('You’re ready for your next case:');
    expect(html(view({ snapshot: snap({ skills: [], all_clear: true }) }))).toContain('Nothing from this case needs practice. You’re ready for a harder case.');
    expect(html(view({ snapshot: snap({ partial: true }) }))).toContain('You ended this case early, so these come from the parts you reached.');
    expect(html(view({ nextCase: 'all_taken' }))).toContain('You’ve taken every case. Retake one?');
  });
  it('shows Preparing while the step runs, and Try again when it failed', () => {
    expect(html({ state: 'preparing' })).toContain('Preparing your next steps…');
    expect(html({ state: 'failed' })).toContain('Your next steps couldn’t be prepared.');
  });
});
