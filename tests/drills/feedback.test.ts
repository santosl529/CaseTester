import { describe, it, expect } from 'vitest';
import { checkinWeeks, feedbackFeed, reportedItems, weekOf, type FeedbackRows } from '@/lib/drills/reports/feedback-compute';

const at = (iso: string) => new Date(iso);

function rows(over: Partial<FeedbackRows> = {}): FeedbackRows {
  return { feedback: [], reports: [], checkins: [], clubOf: new Map([['s1', 'club-a'], ['s2', 'club-b']]), ...over };
}

describe('pilot feedback reports', () => {
  it('weeks start on Monday (UTC)', () => {
    expect(weekOf(at('2026-10-18T23:00:00Z'))).toBe('2026-10-12');   // a Sunday
    expect(weekOf(at('2026-10-19T00:00:00Z'))).toBe('2026-10-19');   // a Monday
  });

  it('the feed is newest first, filters by type and page, and groups set pages', () => {
    const r = rows({
      feedback: [
        { at: at('2026-10-10T10:00:00Z'), studentId: 's1', category: 'broken', comment: 'Timer froze', page: '/drills/sets/aaaaaaaa-0000-0000-0000-000000000000', item: 'ps1-0001@2', device: 'x' },
        { at: at('2026-10-12T10:00:00Z'), studentId: 's2', category: 'idea', comment: null, page: '/drills', item: null, device: 'x' },
      ],
      reports: [{ at: at('2026-10-11T10:00:00Z'), studentId: 's1', setId: 'bbbb', drillId: 'PS-1', item: 'ps1-0002@1', reason: 'answer_key_wrong', comment: 'B is right', status: 'open' }],
      checkins: [
        { at: at('2026-10-13T10:00:00Z'), studentId: 's1', kind: 'set_usefulness', status: 'answered', rating: 4, comment: null },
        { at: at('2026-10-13T11:00:00Z'), studentId: 's2', kind: 'week_1', status: 'dismissed', rating: null, comment: null },
      ],
    });
    const all = feedbackFeed(r, {});
    expect(all.entries.map(e => e.type)).toEqual(['checkin', 'idea', 'report', 'broken']);
    expect(all.entries[0].detail).toContain('4/5');
    expect(all.entries[1].club).toBe('club-b');
    expect(all.pages).toContain('/drills/sets/…');
    expect(feedbackFeed(r, { type: 'report' }).entries.map(e => e.comment)).toEqual(['B is right']);
    expect(feedbackFeed(r, { page: '/drills/sets/…' }).entries.map(e => e.type)).toEqual(['report', 'broken']);
  });

  it('reported items: most open reports first, with reasons counted', () => {
    const report = (item: string, reason: string, status: string, day: number) => ({ at: at(`2026-10-${10 + day}T10:00:00Z`), studentId: 's1', setId: 'x', drillId: 'PS-1', item, reason, comment: `c${day}`, status });
    const list = reportedItems(rows({ reports: [
      report('a@1', 'answer_key_wrong', 'resolved', 1),
      report('b@1', 'grade_unfair', 'open', 2),
      report('b@1', 'grade_unfair', 'open', 3),
      report('a@1', 'other', 'resolved', 4),
    ] }));
    expect(list.map(i => i.item)).toEqual(['b@1', 'a@1']);
    expect(list[0]).toMatchObject({ reports: 2, open: 2, reasons: { 'My grade seems unfair': 2 }, latest: 'c3' });
  });

  it('check-in average by week, newest first, with dismissals', () => {
    const c = (iso: string, status: string, rating: number | null) => ({ at: at(iso), studentId: 's1', kind: 'set_usefulness', status, rating, comment: null });
    const weeks = checkinWeeks(rows({ checkins: [
      c('2026-10-06T10:00:00Z', 'answered', 2), c('2026-10-08T10:00:00Z', 'answered', 4),
      c('2026-10-14T10:00:00Z', 'answered', 5), c('2026-10-15T10:00:00Z', 'dismissed', null), c('2026-10-15T11:00:00Z', 'shown', null),
    ] }));
    expect(weeks).toEqual([
      { week: '2026-10-12', answered: 1, dismissed: 1, average: 5 },
      { week: '2026-10-05', answered: 2, dismissed: 0, average: 3 },
    ]);
  });
});
