// Pure parts of the pilot feedback reports (feedback.ts loads the rows).

export interface FeedbackRows {
  feedback: { at: Date; studentId: string; category: string; comment: string | null; page: string; item: string | null; device: string | null }[];
  reports: { at: Date; studentId: string; setId: string; drillId: string; item: string; reason: string; comment: string | null; status: string }[];
  checkins: { at: Date; studentId: string; kind: string; status: string; rating: number | null; comment: string | null }[];
  clubOf: Map<string, string | null>;
}

export const FEED_TYPES = {
  broken: "Something's broken",
  confusing: "Something's confusing",
  idea: 'Idea',
  report: 'Item report',
  checkin: 'Check-in',
} as const;
export type FeedType = keyof typeof FEED_TYPES;

const REASON: Record<string, string> = { answer_key_wrong: 'Answer key is wrong', question_confusing: 'Question is confusing', grade_unfair: 'My grade seems unfair', other: 'Other' };
const CHECKIN: Record<string, string> = { set_usefulness: 'How useful was today’s practice?', first_case: 'After the first full case', week_1: 'End of week 1' };
const FEED_LIMIT = 100;

export interface FeedEntry { at: Date; type: FeedType; detail: string; page: string; item: string | null; comment: string | null; club: string | null; device: string | null }

// Newest first: feedback, item reports and answered check-ins with something
// to read (a comment, or a usefulness rating).
export function feedbackFeed(rows: FeedbackRows, filter: { type?: string; page?: string }): { entries: FeedEntry[]; pages: string[]; total: number } {
  const club = (id: string) => rows.clubOf.get(id) ?? null;
  const all: FeedEntry[] = [
    ...rows.feedback.map(f => ({ at: f.at, type: f.category as FeedType, detail: FEED_TYPES[f.category as FeedType] ?? f.category, page: f.page, item: f.item, comment: f.comment, club: club(f.studentId), device: f.device })),
    ...rows.reports.map(r => ({ at: r.at, type: 'report' as const, detail: `${REASON[r.reason] ?? r.reason} (${r.status})`, page: `/drills/sets/${r.setId}`, item: r.item, comment: r.comment, club: club(r.studentId), device: null })),
    ...rows.checkins.filter(c => c.status === 'answered').map(c => ({
      at: c.at, type: 'checkin' as const, detail: `${CHECKIN[c.kind] ?? c.kind}${c.rating !== null ? ` ${c.rating}/5` : ''}`,
      page: c.kind === 'set_usefulness' ? '/drills/sets/…/results' : '/drills', item: null, comment: c.comment, club: club(c.studentId), device: null,
    })),
  ];
  // Sets differ per student, so set pages are grouped as one page.
  const pageKey = (p: string) => p.replace(/\/drills\/sets\/[^/]+/, '/drills/sets/…');
  const pages = [...new Set(all.map(e => pageKey(e.page)))].sort();
  const kept = all
    .filter(e => !filter.type || e.type === filter.type)
    .filter(e => !filter.page || pageKey(e.page) === filter.page)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
  return { entries: kept.slice(0, FEED_LIMIT), pages, total: kept.length };
}

// Items students reported, most reports first: shown next to the flagged items.
export function reportedItems(rows: FeedbackRows) {
  const byItem = new Map<string, { item: string; drill_id: string; reports: number; open: number; reasons: Record<string, number>; latest: string | null; latest_at: Date }>();
  for (const r of rows.reports) {
    const e = byItem.get(r.item) ?? { item: r.item, drill_id: r.drillId, reports: 0, open: 0, reasons: {}, latest: null, latest_at: r.at };
    e.reports++;
    if (r.status === 'open') e.open++;
    e.reasons[REASON[r.reason] ?? r.reason] = (e.reasons[REASON[r.reason] ?? r.reason] ?? 0) + 1;
    if (r.at >= e.latest_at) { e.latest_at = r.at; e.latest = r.comment ?? e.latest; }
    byItem.set(r.item, e);
  }
  return [...byItem.values()].sort((a, b) => b.open - a.open || b.reports - a.reports || b.latest_at.getTime() - a.latest_at.getTime());
}

// The Monday (UTC) starting the week a date falls in.
export const weekOf = (d: Date) => {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};

// "How useful was today's practice?" by week, newest first: answers, the
// average rating, and how many were dismissed.
export function checkinWeeks(rows: FeedbackRows) {
  const weeks = new Map<string, { week: string; answered: number; dismissed: number; sum: number }>();
  for (const c of rows.checkins.filter(c => c.kind === 'set_usefulness' && c.status !== 'shown')) {
    const w = weekOf(c.at);
    const e = weeks.get(w) ?? { week: w, answered: 0, dismissed: 0, sum: 0 };
    if (c.status === 'answered' && c.rating !== null) { e.answered++; e.sum += c.rating; } else if (c.status === 'dismissed') e.dismissed++;
    weeks.set(w, e);
  }
  return [...weeks.values()].sort((a, b) => b.week.localeCompare(a.week)).map(e => ({ week: e.week, answered: e.answered, dismissed: e.dismissed, average: e.answered ? e.sum / e.answered : null }));
}
