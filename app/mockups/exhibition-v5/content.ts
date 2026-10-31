// The exhibition homepage mockup, v3 (Matt's briefs, 23 Oct 2026): a guided
// ride through the training loop, told as one student's story. Copy is Matt's; product views are
// recreations of real CaseTester components with sample data. Hardcoded;
// nothing is sent anywhere.

export const HERO = {
  headline: 'A complete case interview training program, built around you.',
  subhead: 'Diagnostic, lessons, skill drills, and AI mock interviews, all in one comprehensive, personalized plan that adapts as you improve.',
  primary: 'Take the free diagnostic',
  reassurance: 'No experience needed. Free to start.',
  secondary: 'See how it works',
  tryLink: 'Or try a question yourself.',
};

// The hero loop: interview first, then the system responding (~12 s).
export const HERO_STEPS = [
  { label: 'Live interview', ms: 5000 },
  { label: 'Gap caught', ms: 3000 },
  { label: 'Plan adapts', ms: 4000 },
] as const;

// The hero previews the story the ride tells: Lorenzo's Day 1 margin slip,
// caught, then turned into the first row of his plan.
export const HERO_CALL = {
  context: 'Fresh Basket · Lorenzo, Day 1',
  ask: 'So where does that leave the margin?',
  answer: 'It went from 6% to 4%.',
  gap: 'Math slip caught: it’s 2%, not 4%.',
  week: 'Lorenzo’s plan · Week 1 of 6',
  newRow: { slot: 'Weak spot', drill: 'Consulting math', reason: 'From your interview: margin was 2%, not 4%.', minutes: '6 min', thread: true },
  rows: [
    { slot: 'Review', drill: 'Spot the gap', reason: 'Structure: keep it sharp.', minutes: '4 min' },
    { slot: 'Something new', drill: 'Chart read', reason: 'Exhibits are next week’s focus.', minutes: '5 min' },
  ],
  skill: 'Math setup',
};

export const QUESTION = {
  prompt: 'Revenue grew from $40M to $50M. What’s the percent change?',
  options: [
    { text: '20%', correct: false, mistake: 'Wrong base', explain: 'You divided by the new value. Percent change uses the starting value.' },
    { text: '25%', correct: true, mistake: null, explain: '$10M ÷ $40M = 25%.' },
    { text: '2.5%', correct: false, mistake: 'Zeros error', explain: 'You’re off by 10×.' },
    { text: '10%', correct: false, mistake: 'Absolute vs. percent', explain: '$10M is the dollar change, not the percent change.' },
  ],
  more: 'Get your full diagnostic',
  back: 'Back to the demo',
};

export const LOOP_INTRO = {
  headline: 'A training system, not a case library',
  subhead: 'Most prep tools give you generic drills and a library of cases. That’s not nearly enough. We take a different approach, inspired by how elite performers train: diagnose weaknesses, master concepts, practice with purpose, perform under pressure, and repeat until you’re ready.',
};

// The loop's nodes, in chapter order; `short` is the sticky rail's label.
export const NODES = [
  { id: 'diagnose', label: 'Diagnose', short: 'Diagnose', description: 'Benchmark yourself on the 8 skills top firms test.' },
  { id: 'plan', label: 'Your plan', short: 'Plan', description: '1 week, 2 weeks, 3 months, or anywhere in between, built around your gaps.' },
  { id: 'learn', label: 'Learn', short: 'Learn', description: 'Sharp, focused lessons. No business background required.' },
  { id: 'drill', label: 'Drill', short: 'Drill', description: 'Targeted reps on one skill at a time until it’s automatic.' },
  { id: 'mock', label: 'Mock interview', short: 'Mock', description: 'A full case with an AI interviewer that pushes back like a real consultant.' },
  { id: 'adapt', label: 'Plan updates', short: 'Updates', description: 'Every result recalibrates your plan to what’s holding you back now.' },
] as const;

export interface ChapterCopy { id: string; label: string; headline: string; body: string; bullets: string[] }

// The story the six chapters tell (Matt, 23 Oct v3): one student, Lorenzo
// (a labelled sample), and one weak spot, followed from the slip that reveals
// it to mastery. The thread is the product skill Math setup (QN.setup); its
// pill sits on every chapter and climbs with him.
export const THREAD = { student: 'Lorenzo', skill: 'Math setup' };

export type ThreadState = 'none' | 'gap' | 'focus' | 'learning' | 'practiced' | 'passed' | 'mastered';

export const STORY: Record<string, { day: string; left: string; line: string }> = {
  diagnose: { day: 'Day 1', left: '25 days to his interview', line: 'Lorenzo’s diagnostic. He says the margin fell to 4%. It fell to 2%.' },
  plan: { day: 'Day 1', left: '25 days to go', line: 'His plan starts with that slip: margin math leads today’s workout.' },
  learn: { day: 'Day 2', left: '24 days to go', line: 'A 3-minute lesson on the exact slip: set up the margin before you calculate.' },
  drill: { day: 'Day 5', left: '21 days to go', line: 'Margin reps with the same trap, until the setup is automatic.' },
  mock: { day: 'Day 12', left: '14 days to go', line: 'A new case. He sets up the margin first and gets it right.' },
  adapt: { day: 'Day 12', left: '14 days to go', line: 'Math setup reaches Mastered. The report found his next weak spot.' },
};

export const CHAPTERS: Record<string, ChapterCopy> = {
  diagnose: {
    id: 'diagnose', label: '01 · Diagnose', headline: 'Know exactly where you stand',
    body: 'Start with a live mock interview and a quick skills check. You’ll see how you score on the 8 skills top firms test, so your training starts from your real gaps, not guesses.',
    bullets: ['A real-time interview with an AI interviewer that probes and pushes back', 'Your score on every skill, from structuring to synthesis', 'Your biggest gaps, ranked'],
  },
  plan: {
    id: 'plan', label: '02 · Your plan', headline: 'Never guess what to practice next',
    body: 'Most students waste hours deciding what to work on. Your plan decides for you, built around your timeline and your gaps, whether your interview is next week or three months away.',
    bullets: ['A daily workout that tells you exactly what to do today', 'Plans from 1 week to 3 months, or anywhere in between', 'Recalibrates automatically as you improve'],
  },
  learn: {
    id: 'learn', label: '03 · Learn', headline: 'Master the concepts behind every great answer',
    body: '20+ focused lessons show you what interviewers reward and why, with strong and weak answers side by side.',
    bullets: ['No business background required', 'Real examples of what offer-level answers sound like', 'Industry-specific insight, not recycled frameworks'],
  },
  drill: {
    id: 'drill', label: '04 · Drill', headline: 'Practice with purpose',
    body: '200+ targeted drills train one skill at a time, from mental math to market sizing to reading charts. Then you’ll defend your answer, just like in the real interview.',
    bullets: ['Mental math, market sizing, case math, and chart reading', 'Follow-up questions that test real understanding', 'Instant feedback on every rep'],
  },
  mock: {
    id: 'mock', label: '05 · Mock interview', headline: 'Prove it in a full case',
    body: 'Put every skill together in a full case with an AI interviewer that challenges weak logic, responds to what you actually say, and catches math errors the way a real interviewer would. Then get feedback that pinpoints exactly what to fix.',
    bullets: ['Interviewer-led or candidate-led, the two formats firms use', 'Scored on all 8 skills, with a stage-by-stage breakdown', 'Every feedback point backed by what you actually said'],
  },
  adapt: {
    id: 'adapt', label: '06 · Plan updates', headline: 'Your plan gets smarter every time',
    body: 'Every result recalibrates your plan to focus on what’s holding you back now. A skill only counts as mastered when it holds up in situations you haven’t seen before.',
    bullets: ['New weak spots go straight into your next workout', 'Skills progress from learning to practiced to mastered', 'Mastery means passing problems you’ve never seen'],
  },
};

// Chapter 01: the Fresh Basket interview as live captions. `mark` is the
// highlighted phrase; `note` its annotation. `scene` groups lines into the
// chapter's scroll scenes.
export interface Line { who: 'Interviewer' | 'Lorenzo'; text: string; mark?: string; note?: string; exhibit?: true; slip?: true; scene: number }

export const TRANSCRIPT: Line[] = [
  { scene: 0, who: 'Interviewer', text: 'Our client, Fresh Basket, is a regional grocery chain. Profit has fallen sharply over two years, even though sales are flat. They want to know why, and what to do about it.' },
  { scene: 0, who: 'Lorenzo', text: 'Before I structure this, is the decline across all stores, or concentrated in a few?' },
  { scene: 1, who: 'Interviewer', text: 'It’s across all 40 stores.', mark: 'across all 40 stores', note: 'Real answers, straight from the case.' },
  { scene: 1, who: 'Lorenzo', text: 'Then I’d split profit into revenue and costs. Since sales are flat, I’d start with costs: product costs, labor, and overhead.' },
  { scene: 1, who: 'Interviewer', text: 'Good. Here’s the cost breakdown.', exhibit: true },
  { scene: 2, who: 'Lorenzo', text: 'So the margin went from 6% to 4%.', mark: 'from 6% to 4%', slip: true },
  { scene: 2, who: 'Interviewer', text: 'Walk me through how you got 4%.', mark: 'Walk me through', note: 'Math slip caught: it’s 2%. This becomes Lorenzo’s weak spot.' },
  { scene: 3, who: 'Lorenzo', text: 'Sorry: 100 minus 74, 15, and 9 is 2%. So the margin fell from 6% to 2%.' },
  { scene: 3, who: 'Interviewer', text: 'Our CFO thinks this is a labor problem. Do you agree?', mark: 'Do you agree?', note: 'Pushback, just like a real interviewer.' },
  { scene: 3, who: 'Lorenzo', text: 'No. Labor held at 15% of sales. The 4-point rise in product costs explains the entire drop.', mark: 'The 4-point rise in product costs explains the entire drop.', note: 'Defended with evidence.' },
];

export const EXHIBIT = {
  title: 'Exhibit 1 · Costs as a share of sales',
  rows: [
    { cost: 'Product costs', before: '70%', after: '74%' },
    { cost: 'Labor', before: '15%', after: '15%' },
    { cost: 'Overhead', before: '9%', after: '9%' },
  ],
};

// The snapshot chapter 01 ends on and chapter 02 starts from.
export const SNAPSHOT = [
  { skill: 'Problem structuring', strong: true },
  { skill: 'Quantitative rigor', strong: false, thread: 'Math setup: margin was 2%, not 4%' },
  { skill: 'Exhibit interpretation', strong: true },
];

// Chapter 02's sample student (a labeled sample; Matt, 23 Oct v3).
export const SAMPLE_PLAN = { owner: 'Lorenzo’s plan', track: 'Standard · 6 weeks', interview: 'Interview: Nov 21 · 25 days' };

// The Standard track's week themes (lib/drills config).
export const WEEKS = ['Structure and math', 'Hypotheses and exhibits', 'Judgment and synthesis', 'Integration', 'Interview performance', 'Readiness'];

export const WORKOUT_FROM_SNAPSHOT = [
  { slot: 'Weak spot', drill: 'Consulting math', reason: 'From your diagnostic: margin was 2%, not 4%.', minutes: '6 min', thread: true },
  { slot: 'Review', drill: 'Spot the gap', reason: 'Structure: keep it sharp.', minutes: '4 min' },
  { slot: 'Something new', drill: 'Chart read', reason: 'Exhibits are next week’s focus.', minutes: '5 min' },
];

// Chapter 03: the product's Math setup lesson, on a new example, with
// Lorenzo's Day 1 slip as the weak answer.
export const LESSON = {
  meta: 'Lesson · 3 min · Math setup',
  title: 'Set up the formula before you calculate',
  prompt: 'A café’s costs rose from 88% to 93% of sales. What’s its margin now?',
  weak: { label: 'Weak answer', buckets: ['Margin was about 12%', 'Costs went up', 'So it’s probably around 10%'], flagged: 2, note: 'A guess, not a setup: Lorenzo’s Day 1 slip.' },
  strong: {
    label: 'Strong answer',
    buckets: ['Margin = 100% − costs', 'Costs now: 93% of sales', '100 − 93 = 7%', 'Down 5 points, from 12% to 7%'],
    note: 'Formula first, then the numbers.',
  },
};

// Chapter 04: a Consulting math drill with the same trap (the product's
// "wrong base" mistake), then a follow-up on the setup itself.
export const DRILL = {
  meta: 'Consulting math · Math setup · Item 2 of 5',
  prompt: 'Sales are $50M. Profit fell from $3M to $1M. What’s the margin now?',
  wrong: { answer: '33%', chip: 'Wrong base: margin divides by sales' },
  right: { answer: '2%', chip: 'Correct. $1M ÷ $50M = 2%.' },
  followup: { meta: 'Follow-up · Consulting math', text: 'Before any numbers: what formula did you set up, and why divide by sales?' },
};

// Chapter 05: a later mock on a new case. Math setup holds up; a different
// weak spot (Synthesis) surfaces, which chapter 06 picks up.
export const REPORT = {
  case: 'Harbor Coffee',
  rows: [
    { skill: 'Problem structuring', rating: 'Strong' },
    { skill: 'Quantitative rigor', rating: 'Strong', was: 'Day 1: Focus area', thread: true },
    { skill: 'Exhibit interpretation', rating: 'Strong' },
    { skill: 'Business judgment', rating: 'Adequate' },
    { skill: 'Creativity', rating: 'Adequate' },
    { skill: 'Synthesis', rating: 'Needs work' },
    { skill: 'Communication', rating: 'Adequate' },
    { skill: 'Composure under pushback', rating: 'Strong' },
  ],
  stages: ['Structure', 'Math', 'Exhibits', 'Brainstorming', 'Synthesis'],
  quote: 'Costs are 92% of sales, so the margin is 100 minus 92: 8%.',
  point: { label: 'Strength · Quantitative rigor', text: 'Set up the margin before calculating. Right the first time.' },
  closing: 'That’s a strong place to stop. Let’s look at your feedback.',
};

// Chapter 06: Math setup reaches Mastered (it passed in a case he hadn't
// seen); the report's new weak spot leads the next workout; margin math
// drops to review.
export const ADAPT = {
  point: { label: 'Work on · Synthesis', text: 'Recommendation left out the key risk.' },
  newRow: { slot: 'Weak spot', drill: '60-second recommendation', reason: 'From your mock interview: name the key risk.', minutes: '6 min' },
  rows: [
    { slot: 'Review', drill: 'Consulting math', reason: 'Math setup: mastered. Kept sharp.', minutes: '4 min', thread: true },
  ],
  // `thread` climbs last and slowest: the payoff.
  skills: [
    { name: 'Math setup', end: 'mastered', thread: true },
    { name: 'MECE structure', end: 'mastered' },
    { name: 'Percentages', end: 'mastered' },
    { name: 'Chart takeaway', end: 'practiced' },
    { name: 'Case-specific structure', end: 'practiced' },
    { name: 'Complete recommendation', end: 'learning' },
  ] as { name: string; end: 'learning' | 'practiced' | 'mastered'; thread?: true }[],
};
