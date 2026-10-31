// The exhibition homepage mockup, v2 (Matt's brief, 23 Oct 2026): a guided
// ride through the training loop. Copy is Matt's; product views are
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

export const HERO_CALL = {
  context: 'Gym chain · at-home subscription',
  ask: 'How would you structure this?',
  answer: 'I’d look at market size, member demand, revenue, and costs.',
  gap: 'Missing bucket: competitors and capabilities.',
  week: 'Standard · Week 2 of 6',
  newRow: { slot: 'Weak spot', drill: 'Framework builder', reason: 'From your interview: your structure missed a key bucket.', minutes: '6 min' },
  rows: [
    { slot: 'Review', drill: 'Chart read', reason: 'Chart takeaway: last practiced 9 days ago.', minutes: '4 min' },
    { slot: 'Something new', drill: 'Initial hypothesis', reason: 'Forming a hypothesis is this week’s focus.', minutes: '7 min' },
  ],
  skill: 'Case-specific structure',
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
export interface Line { who: 'Interviewer' | 'You'; text: string; mark?: string; note?: string; exhibit?: true; scene: number }

export const TRANSCRIPT: Line[] = [
  { scene: 0, who: 'Interviewer', text: 'Our client, Fresh Basket, is a regional grocery chain. Profit has fallen sharply over two years, even though sales are flat. They want to know why, and what to do about it.' },
  { scene: 0, who: 'You', text: 'Before I structure this, is the decline across all stores, or concentrated in a few?' },
  { scene: 1, who: 'Interviewer', text: 'It’s across all 40 stores.', mark: 'across all 40 stores', note: 'Real answers, straight from the case.' },
  { scene: 1, who: 'You', text: 'Then I’d split profit into revenue and costs. Since sales are flat, I’d start with costs: product costs, labor, and overhead.' },
  { scene: 1, who: 'Interviewer', text: 'Good. Here’s the cost breakdown.', exhibit: true },
  { scene: 2, who: 'You', text: 'So the margin went from 6% to 4%.' },
  { scene: 2, who: 'Interviewer', text: 'Walk me through how you got 4%.', mark: 'Walk me through', note: 'Math error caught. It probes instead of giving the answer.' },
  { scene: 3, who: 'You', text: 'Sorry: 100 minus 74, 15, and 9 is 2%. So the margin fell from 6% to 2%.' },
  { scene: 3, who: 'Interviewer', text: 'Our CFO thinks this is a labor problem. Do you agree?', mark: 'Do you agree?', note: 'Pushback, just like a real interviewer.' },
  { scene: 3, who: 'You', text: 'No. Labor held at 15% of sales. The 4-point rise in product costs explains the entire drop.', mark: 'The 4-point rise in product costs explains the entire drop.', note: 'Defended with evidence.' },
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
  { skill: 'Quantitative rigor', strong: false },
  { skill: 'Exhibit interpretation', strong: true },
];

// The Standard track's week themes (lib/drills config).
export const WEEKS = ['Structure and math', 'Hypotheses and exhibits', 'Judgment and synthesis', 'Integration', 'Interview performance', 'Readiness'];

export const WORKOUT_FROM_SNAPSHOT = [
  { slot: 'Weak spot', drill: 'Consulting math', reason: 'From your diagnostic: your margin math slipped.', minutes: '6 min' },
  { slot: 'Review', drill: 'Spot the gap', reason: 'Structure: keep it sharp.', minutes: '4 min' },
  { slot: 'Something new', drill: 'Chart read', reason: 'Exhibits are next week’s focus.', minutes: '5 min' },
];

export const LESSON = {
  meta: 'Lesson · 3 min',
  title: 'Building a case-specific framework',
  prompt: 'A regional gym chain is deciding whether to launch an at-home fitness subscription.',
  weak: { label: 'Weak answer', buckets: ['Market', 'Customers', 'Competition', 'Costs'], flagged: 1, note: 'Generic. Could apply to any case.' },
  strong: {
    label: 'Strong answer',
    buckets: ['Will current members pay for at-home workouts?', 'Who already sells at-home fitness, and at what price?', 'Can the chain film and stream classes well?', 'Does subscription revenue cover production and platform costs?'],
    note: 'Built for this client’s question.',
  },
};

export const DRILL = {
  meta: 'Mental math · Item 2 of 5',
  prompt: 'Revenue grew from $40M to $50M. What’s the percent change?',
  wrong: { answer: '20%', chip: 'Wrong base: percent change uses the starting value' },
  right: { answer: '25%', chip: 'Correct. $10M ÷ $40M = 25%.' },
  followup: { meta: 'Follow-up · Framework builder', text: 'Which bucket would you dig into first, and why?' },
};

export const REPORT = {
  rows: [
    { skill: 'Problem structuring', rating: 'Strong' },
    { skill: 'Quantitative rigor', rating: 'Needs work' },
    { skill: 'Exhibit interpretation', rating: 'Strong' },
    { skill: 'Business judgment', rating: 'Adequate' },
    { skill: 'Creativity', rating: 'Adequate' },
    { skill: 'Synthesis', rating: 'Strong' },
    { skill: 'Communication', rating: 'Adequate' },
    { skill: 'Composure under pushback', rating: 'Strong' },
  ],
  stages: ['Structure', 'Math', 'Exhibits', 'Brainstorming', 'Synthesis'],
  quote: 'So the margin went from 6% to 4%.',
  point: { label: 'Work on · Quantitative rigor', text: 'First margin calculation was off. Self-corrected when probed.' },
  closing: 'That’s a strong place to stop. Let’s look at your feedback.',
};

export const ADAPT = {
  point: { label: 'Work on · Quantitative rigor', text: 'First margin calculation was off. Self-corrected when probed.' },
  newRow: { slot: 'Weak spot', drill: 'Consulting math', reason: 'From your mock interview: your margin math slipped.', minutes: '6 min' },
  rows: [
    { slot: 'Review', drill: 'Chart read', reason: 'Exhibit interpretation: keep it sharp.', minutes: '4 min' },
  ],
  skills: [
    { name: 'MECE structure', end: 'mastered' },
    { name: 'Case-specific structure', end: 'mastered' },
    { name: 'Math setup', end: 'practiced' },
    { name: 'Percentages', end: 'mastered' },
    { name: 'Chart takeaway', end: 'practiced' },
    { name: 'Answer first', end: 'practiced' },
  ] as const,
};
