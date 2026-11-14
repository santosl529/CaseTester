// Learn's "For you this week" (Matt, 13 Nov): two or three lessons, from the
// weakest skill and the current week's skills. Pure, so the choice is tested
// (tests/drills/learn-page.test.ts).

export type ForYouReason = 'weakest' | 'week';
export const FOR_YOU_REASON: Record<ForYouReason, string> = {
  weakest: 'Your most frequent mistake in the last 30 days',
  week: 'In focus this week',
};

// The weakest skill's lesson first (read or not: it's still the biggest
// slip), then the week's skills that have a lesson, unread ones first, up to
// `max`. Only skills with a lesson students can open.
export function forYouLessons(input: { available: Set<string>; read: Set<string>; weekSkills: string[]; weakest: string | null; max?: number }): { skill_id: string; reason: ForYouReason }[] {
  const max = input.max ?? 3;
  const out: { skill_id: string; reason: ForYouReason }[] = [];
  if (input.weakest && input.available.has(input.weakest)) out.push({ skill_id: input.weakest, reason: 'weakest' });
  const week = [...new Set(input.weekSkills)].filter(id => input.available.has(id) && !out.some(o => o.skill_id === id));
  const ordered = [...week.filter(id => !input.read.has(id)), ...week.filter(id => input.read.has(id))];
  for (const id of ordered) {
    if (out.length >= max) break;
    out.push({ skill_id: id, reason: 'week' });
  }
  return out;
}
