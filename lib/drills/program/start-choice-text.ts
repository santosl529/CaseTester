// The starting-point choice's text, approved by Matt (21–22 Nov 2026). Plain module: Today (a server component) and
// the tests read it.
export const START_CHOICE = {
  heading: 'How do you want to find your starting point?',
  lead: 'Short on time? Answer a few questions. New to cases? Take the quiz. Done a few? Take the case.',
  endedEarly: 'Your case ended too early to place you.',
  questions: { title: 'Quick questions · 2–3 min', body: 'Tell us about your experience and we’ll build your plan. Your first workouts include short checks.', button: 'Answer the questions' },
  quiz: { title: 'Quick quiz · about 15 min', body: '10 short drills across the core skills. Places 12 skills and builds your plan.', button: 'Start the quiz' },
  case: { title: 'Case interview · about 30 min', body: 'A full mock interview (Brew & Bean) with a feedback report. Places the skills the case tests; the rest get a quick check later.', button: 'Start the case' },
} as const;

// The case card's limit lines: "Uses one of today's 2 cases." while one can start; the daily limit's own line when
// today's are used (other limits keep the Cases page's message).
export function caseCardLines(perDay: number, blocked: string | null): { uses: string; blocked: string | null } {
  return {
    uses: `Uses one of today’s ${perDay} cases.`,
    blocked: blocked === 'daily' ? `You’ve used today’s ${perDay} cases. Take the quiz now, or come back tomorrow.` : null,
  };
}
