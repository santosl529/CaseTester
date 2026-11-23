// Learn's "For you this week" (Matt, 13 Nov): two or three lessons. Since 15
// Nov they lead with the shared ranking (Matt: "so Today, Learn, Progress and
// the report always agree"), then the current week's skills. Pure, so the
// choice is tested (tests/drills/learn-page.test.ts).

export type ForYouReason = 'top' | 'ranked' | 'week';
export const FOR_YOU_REASON: Record<ForYouReason, string> = {
  top: 'Your top skill to work on right now',
  ranked: 'Next on your list to work on',
  week: 'In focus this week',
};
const FROM_RANKING = 2;

// The first skills in the shared ranking that have a lesson (read or not:
// they're still what to work on), at most two, then the week's skills that
// have a lesson, unread ones first, up to `max`.
export function forYouLessons(input: { available: Set<string>; read: Set<string>; weekSkills: string[]; ranked: string[]; max?: number }): { skill_id: string; reason: ForYouReason }[] {
  const max = input.max ?? 3;
  const out: { skill_id: string; reason: ForYouReason }[] = [];
  for (const id of [...new Set(input.ranked)].filter(s => input.available.has(s)).slice(0, FROM_RANKING)) {
    out.push({ skill_id: id, reason: out.length === 0 ? 'top' : 'ranked' });
  }
  const week = [...new Set(input.weekSkills)].filter(id => input.available.has(id) && !out.some(o => o.skill_id === id));
  const ordered = [...week.filter(id => !input.read.has(id)), ...week.filter(id => input.read.has(id))];
  for (const id of ordered) {
    if (out.length >= max) break;
    out.push({ skill_id: id, reason: 'week' });
  }
  return out;
}
