// The exhibition homepage mockup's content (Matt's brief, 23 Oct 2026),
// hardcoded. The product views are faithful recreations of real CaseTester
// components (the Framework builder drill, Today's workout, the skill map),
// with sample data. Nothing here is sent anywhere.

export const HERO = {
  headline: 'A complete case interview training program, built around you.',
  subhead: 'Diagnostic, lessons, skill drills, and AI mock interviews, all in one comprehensive, personalized plan that adapts as you improve.',
  primary: 'Take the free diagnostic',
  reassurance: 'No experience needed. Free to start.',
  secondary: 'See how it works',
  tryLink: 'Or try a question yourself.',
};

export const STATS_LINE = ['8 skills', '20+ lessons', '200+ drills', '10+ industries'];

// The hero loop: four steps, about 10 seconds.
export const STEPS = [
  { label: 'Framework', ms: 3600 },
  { label: 'Gap caught', ms: 2400 },
  { label: 'Plan adapts', ms: 2400 },
  { label: 'Progress', ms: 2400 },
] as const;

export const DEMO = {
  drill: 'Framework builder',
  prompt: 'A regional gym chain is deciding whether to launch an at-home fitness subscription.',
  buckets: ['Market size and growth', 'Demand from current members', 'Revenue potential', 'Launch and operating costs'],
  gap: 'Missing bucket: competitors and capabilities.',
  week: 'Standard · Week 2 of 6',
  newRow: { slot: 'Weak spot', drill: 'Framework builder', reason: 'Your structure missed a key bucket.', minutes: '6 min' },
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

// The interview replay. `mark` is the phrase highlighted in Sky; `note` the
// margin annotation its line draws to.
export interface Line { who: 'Interviewer' | 'Candidate'; text: string; mark?: string; note?: string; exhibit?: true }

export const REPLAY: Line[] = [
  { who: 'Interviewer', text: 'Our client, Fresh Basket, is a regional grocery chain. Profit has fallen sharply over two years, even though sales are flat. They want to know why, and what to do about it.' },
  { who: 'Candidate', text: 'Before I structure this, is the decline across all stores, or concentrated in a few?' },
  { who: 'Interviewer', text: 'It’s across all 40 stores.', mark: 'across all 40 stores', note: 'Real answers, straight from the case.' },
  { who: 'Candidate', text: 'Then I’d split profit into revenue and costs. Since sales are flat, I’d start with costs: product costs, labor, and overhead.' },
  { who: 'Interviewer', text: 'Good. Here’s the cost breakdown.', exhibit: true },
  { who: 'Candidate', text: 'So the margin went from 6% to 4%.' },
  { who: 'Interviewer', text: 'Walk me through how you got 4%.', mark: 'Walk me through', note: 'Math error caught. It probes instead of giving the answer.' },
  { who: 'Candidate', text: 'Sorry: 100 minus 74, 15, and 9 is 2%. So the margin fell from 6% to 2%.' },
  { who: 'Interviewer', text: 'Our CFO thinks this is a labor problem. Do you agree?', mark: 'Do you agree?', note: 'Pushback, just like a real interviewer.' },
  { who: 'Candidate', text: 'No. Labor held at 15% of sales. The 4-point rise in product costs explains the entire drop.', mark: 'The 4-point rise in product costs explains the entire drop.', note: 'Defended with evidence.' },
];

export const REPLAY_EXHIBIT = [
  { cost: 'Product costs', before: '70%', after: '74%' },
  { cost: 'Labor', before: '15%', after: '15%' },
  { cost: 'Overhead', before: '9%', after: '9%' },
];

export const REPLAY_CLOSE = { skill: 'Data interpretation', quote: 'The 4-point rise in product costs explains the entire drop.' };

// Section 3: six weeks, focus area to mastered.
export const PLAN_STEPS = [
  { week: 'Week 1', kind: 'focus', title: 'Weakness identified' },
  { week: 'Week 1', kind: 'lesson', title: 'Lesson added' },
  { week: 'Weeks 2–3', kind: 'drills', title: 'Drills added' },
  { week: 'Week 5', kind: 'mock', title: 'Mock interview' },
  { week: 'Week 6', kind: 'mastered', title: 'Mastery' },
] as const;
