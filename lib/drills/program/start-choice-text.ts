// The starting-point choice's text, approved by Matt (21–22 Nov 2026). Plain module: Today (a server component) and
// the tests read it.
export const START_CHOICE = {
  heading: 'How do you want to find your starting point?',
  lead: 'Short on time? Answer a few questions. New to cases? Take the quiz. Done a few? Take the case.',
  endedEarly: 'Your case ended too early to place you.',
  questions: { title: 'Quick questions · 2–3 min', body: 'Tell us about your experience and we’ll build your plan. Your first workouts include short checks.', button: 'Answer the questions' },
  quiz: { title: 'Quick quiz · about 15 min', body: '10 short drills across the core skills. Places 12 skills and builds your plan.', button: 'Start the quiz' },
  // Practicing on their own (Matt, 22 Nov): no plan, so the cards say what they get instead.
  selfQuestionsBody: 'Tell us about your experience and we’ll suggest what to practice. Your first sets include short checks.',
  selfQuizBody: '10 short drills across the core skills. Places 12 skills and suggests what to practice.',
  // The case's length comes from the case (as on Cases): "Case interview · about 20 min, then a feedback report." (Matt, 22 Nov).
  case: { title: (minutes: number) => `Case interview · about ${minutes} min, then a feedback report.`, body: 'A full mock interview (Brew & Bean) with a feedback report. Places the skills the case tests; the rest get a quick check later.', button: 'Start the case' },
} as const;

// The case card's limit lines: "Uses one of today's 2 cases." while one can start; the daily limit's own line when
// today's are used (other limits keep the Cases page's message).
// While a starting-point case is being graded and its placements haven't arrived (Matt, 22 Nov).
export const BUILDING_PLAN = 'We’re building your plan from your case. It’ll be ready in a few minutes.';

export function caseCardLines(perDay: number, blocked: string | null): { uses: string; blocked: string | null } {
  return {
    uses: `Uses one of today’s ${perDay} cases.`,
    blocked: blocked === 'daily' ? `You’ve used today’s ${perDay} cases. Take the quiz now, or come back tomorrow.` : null,
  };
}
