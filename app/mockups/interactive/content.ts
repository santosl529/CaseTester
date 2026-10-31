// The interactive homepage mockup's content (Matt's brief, 22 Oct 2026),
// hardcoded: the mini diagnostic's questions and scoring, and the sample
// interview replay. Nothing here is sent anywhere.

export interface Option {
  text: string;
  correct: boolean;
  // The named mistake when wrong ("Wrong base"), and the one-line explanation.
  mistake: string | null;
  explain: string;
}

export interface Question {
  skill: string;
  prompt: string;
  framework?: string[];
  chart?: true;
  ask: string;
  options: Option[];
}

export const DIAGNOSTIC_INTRO = {
  title: 'Try it: 3 questions, about 2 minutes',
  body: 'See how we diagnose your skills. No signup needed.',
  start: 'Start',
};

export const QUESTIONS: Question[] = [
  {
    skill: 'Problem structuring',
    prompt: 'A regional gym chain is deciding whether to launch an at-home fitness subscription. A candidate proposes this framework:',
    framework: ['Market size and growth', 'Demand from current members', 'Revenue potential', 'Launch and operating costs'],
    ask: 'What’s the biggest gap?',
    options: [
      { text: 'Buckets 3 and 4 overlap', correct: false, mistake: 'Overlap error', explain: 'Revenue and costs are separate drivers, so these buckets don’t overlap.' },
      { text: 'Missing: competitors and whether the chain can deliver this', correct: true, mistake: null, explain: 'Without competition and capabilities, the framework can’t answer “should they?”' },
      { text: 'Bucket 2 doesn’t matter for this question', correct: false, mistake: 'Irrelevant-bucket error', explain: 'Current members are the most likely early customers, so demand matters.' },
      { text: 'It should start with a profit tree', correct: false, mistake: 'Generic framework', explain: 'This is a market-entry question, so a profit tree misses the strategic issues.' },
    ],
  },
  {
    skill: 'Quantitative rigor',
    prompt: 'Revenue grew from $40M to $50M.',
    ask: 'What’s the percent change?',
    options: [
      { text: '20%', correct: false, mistake: 'Wrong base', explain: 'You divided by the new value ($10M ÷ $50M). Percent change uses the starting value.' },
      { text: '25%', correct: true, mistake: null, explain: '$10M ÷ $40M = 25%.' },
      { text: '2.5%', correct: false, mistake: 'Zeros error', explain: 'You’re off by 10×. Check your decimal places.' },
      { text: '10%', correct: false, mistake: 'Absolute vs. percent', explain: '$10M is the dollar change, not the percent change.' },
    ],
  },
  {
    skill: 'Exhibit interpretation',
    prompt: 'The client wants to know why profit fell.',
    chart: true,
    ask: 'Which takeaway matters most?',
    options: [
      { text: 'Revenue grew steadily each year', correct: false, mistake: 'Trivial takeaway', explain: 'True, but it doesn’t explain why profit fell.' },
      { text: 'Product costs rose from 40% to 52% of revenue, squeezing margins', correct: true, mistake: null, explain: 'That 12-point rise accounts for the entire margin decline.' },
      { text: 'Labor costs drove the decline', correct: false, mistake: 'Misread', explain: 'Labor held steady at 25% of revenue.' },
      { text: 'The client should raise prices', correct: false, mistake: 'Unsupported', explain: 'The chart doesn’t show prices, and this jumps to a solution before diagnosing.' },
    ],
  },
];

// Question 3's exhibit: each cost as a share of revenue, by year.
export const CHART = {
  years: ['Year 1', 'Year 2', 'Year 3'],
  revenue: [100, 105, 110],
  series: [
    { key: 'product', label: 'Product costs', values: [40, 46, 52] },
    { key: 'labor', label: 'Labor', values: [25, 25, 25] },
    { key: 'other', label: 'Other costs', values: [15, 15, 15] },
    { key: 'profit', label: 'Profit margin', values: [20, 14, 8] },
  ],
} as const;

export const RESULTS = {
  title: 'Your skill snapshot',
  strong: 'Strong start',
  focus: 'Focus area',
  allCorrect: 'Strong start. Your plan would move you straight to building frameworks from scratch and defending them under pushback.',
  focusLine: (skill: string, mistake: string) => `Your starting focus: ${skill}. Your plan would open with a short lesson, then targeted drills on ${mistake}.`,
  note: 'This snapshot is based on 3 questions. The full diagnostic covers all 8 skills.',
  primary: 'Get your full plan',
  again: 'Try again',
};

export const STATS_LINE = ['8 skills', '20+ lessons', '200+ drills', '10+ industries'];

// The sample interview: each line, and the margin note beside it (if any).
export type Line =
  | { who: 'Interviewer' | 'Candidate'; text: string; exhibit?: true; note?: string };

export const REPLAY: Line[] = [
  { who: 'Interviewer', text: 'Our client, Fresh Basket, is a regional grocery chain. Profit has fallen sharply over two years, even though sales are flat. They want to know why, and what to do about it.' },
  { who: 'Candidate', text: 'Before I structure this, is the decline across all stores, or concentrated in a few?' },
  { who: 'Interviewer', text: 'It’s across all 40 stores.', note: 'Data requests get real answers from the case.' },
  { who: 'Candidate', text: 'Then I’d split profit into revenue and costs. Since sales are flat, I’d start with costs: product costs, labor, and overhead.' },
  { who: 'Interviewer', text: 'Good. Here’s the cost breakdown.', exhibit: true },
  { who: 'Candidate', text: 'So the margin went from 6% to 4%.' },
  { who: 'Interviewer', text: 'Walk me through how you got 4%.', note: 'Math error caught. The interviewer probes instead of giving the answer.' },
  { who: 'Candidate', text: 'Sorry: 100 minus 74, 15, and 9 is 2%. So the margin fell from 6% to 2%.' },
  { who: 'Interviewer', text: 'Our CFO thinks this is a labor problem. Do you agree?' },
  { who: 'Candidate', text: 'No. Labor held at 15% of sales. The 4-point rise in product costs explains the entire drop.', note: 'Pushback tests whether you can defend your answer with evidence.' },
];

export const REPLAY_EXHIBIT = [
  { cost: 'Product costs', before: '70%', after: '74%' },
  { cost: 'Labor', before: '15%', after: '15%' },
  { cost: 'Overhead', before: '9%', after: '9%' },
];

export const REPLAY_FEEDBACK = {
  strength: { label: 'Strength', skill: 'Data interpretation', text: 'Tied the margin drop to product costs using the exhibit:', quote: 'The 4-point rise in product costs explains the entire drop.' },
  work: { label: 'Work on', skill: 'Quantitative rigor', text: 'First margin calculation was off', quote: 'So the margin went from 6% to 4%', after: 'Self-corrected when probed.' },
  note: 'Every feedback point is backed by a quote from your interview.',
};

export const LOOP = ['Free diagnostic', 'Your plan', 'Learn', 'Drill', 'Mock interview', 'Plan updates'];
