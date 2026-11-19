// An interview rebuilt from the database when its page loads (Matt, 17 Nov, pre-pilot audit M2: a refresh, or
// reopening a closed tab, showed only the opening prompt and lost the exhibits).
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ usePathname: () => '/case/x', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { buildCaseHistory } from '@/lib/site/case-history';
import { TextCaseScreen, VoiceCaseScreen } from '@/components/views/case';
import { EARLIER_LABEL } from '@/components/voice-room';

const SID = '51111111-1111-4111-8111-111111111111';
const EXHIBITS = [
  { id: 'exhibit-1', title: 'Results by route', chartType: 'table', data: [{ Route: 'Hub–Lakeport', Revenue: 26.4 }], notes: 'FY2023 vs FY2025' },
  { id: 'exhibit-2', title: 'Port Avery per flight', chartType: 'table', data: [{ Item: 'Seats', Value: 80 }] },
];
// Six turns as the text route stores them: the exhibit is recorded at its candidate turn's time (settle-turn.ts).
const TURNS = [
  { turnIndex: 0, role: 'interviewer', text: 'Our client is Larkspur Air. How would you approach it?', timestampMs: 1_000 },
  { turnIndex: 1, role: 'candidate', text: 'Revenue fell 12% while costs held flat.', timestampMs: 2_000 },
  { turnIndex: 2, role: 'interviewer', text: 'Here are the results by route.', timestampMs: 2_900 },
  { turnIndex: 3, role: 'candidate', text: 'Lakeport and Port Avery explain the whole drop.', timestampMs: 4_000 },
  { turnIndex: 4, role: 'interviewer', text: 'What would you look at next?', timestampMs: 4_900 },
  { turnIndex: 5, role: 'candidate', text: 'Fares on those two routes.', timestampMs: 6_000 },
];

describe('buildCaseHistory (M2)', () => {
  it('every stored turn, in order', () => {
    const h = buildCaseHistory(TURNS, [], EXHIBITS);
    expect(h.map(m => `${m.role}: ${m.text}`)).toEqual(TURNS.map(t => `${t.role}: ${t.text}`));
  });
  it('a text interview\'s exhibit goes on the reply to the turn it was recorded at', () => {
    const h = buildCaseHistory(TURNS, [{ exhibitId: 'exhibit-1', shownAtMs: 2_000 }], EXHIBITS);
    expect(h[2].exhibit).toEqual({ id: 'exhibit-1', title: 'Results by route', chartType: 'table', data: [{ Route: 'Hub–Lakeport', Revenue: 26.4 }], notes: 'FY2023 vs FY2025' });
    expect(h.filter(m => m.exhibit)).toHaveLength(1);
  });
  it('a voice interview\'s exhibit (recorded when it rendered) goes on the latest reply by then', () => {
    const h = buildCaseHistory(TURNS, [{ exhibitId: 'exhibit-2', shownAtMs: 5_200 }], EXHIBITS);
    expect(h[4].exhibit?.id).toBe('exhibit-2');
  });
  it('an exhibit shown twice appears once; an unknown one is skipped', () => {
    const h = buildCaseHistory(TURNS, [{ exhibitId: 'exhibit-1', shownAtMs: 2_000 }, { exhibitId: 'exhibit-1', shownAtMs: 4_000 }, { exhibitId: 'nope', shownAtMs: 4_000 }], EXHIBITS);
    expect(h.filter(m => m.exhibit).map(m => m.exhibit!.id)).toEqual(['exhibit-1']);
  });
  it('two exhibits on one reply: the second follows as its own message', () => {
    const h = buildCaseHistory(TURNS, [{ exhibitId: 'exhibit-1', shownAtMs: 2_000 }, { exhibitId: 'exhibit-2', shownAtMs: 2_000 }], EXHIBITS);
    expect(h[2].exhibit?.id).toBe('exhibit-1');
    expect(h[3]).toEqual({ role: 'interviewer', text: '', exhibit: expect.objectContaining({ id: 'exhibit-2' }) });
    expect(h).toHaveLength(TURNS.length + 1);
  });
  it('nothing stored yet: nothing (the page falls back to a welcome line)', () => {
    expect(buildCaseHistory([], [], EXHIBITS)).toEqual([]);
  });
});

describe('the interview page after a refresh or a reopened tab (M2)', () => {
  const history = buildCaseHistory(TURNS, [{ exhibitId: 'exhibit-1', shownAtMs: 2_000 }], EXHIBITS);
  const text = (h = history) => renderToStaticMarkup(createElement(TextCaseScreen, { sessionId: SID, active: true, completed: false, casePrompt: 'A prompt', history: h }));

  it('refresh mid-case: every turn and the exhibit, in order', () => {
    const html = text();
    let at = 0;
    for (const t of TURNS) {
      const i = html.indexOf(t.text.replace(/'/g, '&#x27;'));
      expect(i, t.text).toBeGreaterThan(at);
      at = i;
    }
    const table = html.indexOf('Results by route');
    expect(table).toBeGreaterThan(html.indexOf('Here are the results by route.'));
    expect(table).toBeLessThan(html.indexOf('Lakeport and Port Avery explain'));
    expect(html).toContain('Hub–Lakeport');
  });
  it('reopening after closing the tab: the same page from the same stored interview', () => {
    // Closing the tab keeps nothing in the browser; the page is rebuilt from the database either way.
    expect(text(buildCaseHistory(TURNS, [{ exhibitId: 'exhibit-1', shownAtMs: 2_000 }], EXHIBITS))).toBe(text());
  });
  it('no turns stored: the welcome line, as before', () => {
    expect(text([])).toContain('Welcome to your case interview.');
  });
  it('voice: the interview so far above the live captions', () => {
    const html = renderToStaticMarkup(createElement(VoiceCaseScreen, { sessionId: SID, active: true, completed: false, casePrompt: 'A prompt', consented: true, history }));
    expect(html).toContain(EARLIER_LABEL);
    for (const t of TURNS) expect(html).toContain(t.text.replace(/'/g, '&#x27;'));
    expect(html).toContain('Results by route');
  });
});
