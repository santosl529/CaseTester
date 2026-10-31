// The exhibition homepage mockup, v3 (Matt's briefs, 23 Oct 2026): a guided
// ride through the training loop, told as one student's story. Copy is Matt's; product views are
// recreations of real product components with sample data. Hardcoded;
// nothing is sent anywhere.

export const HERO = {
  headline: 'A complete case interview training program, built around you.',
  subhead: 'Diagnostic, lessons, skill drills, and AI mock interviews, all in one comprehensive, personalized plan that adapts as you improve.',
  primary: 'Take the free diagnostic',
  reassurance: 'No experience needed. Free to start.',
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
  newRow: { slot: 'Weak spot', drill: 'Consulting math', reason: 'From your interview: margin was 2%, not 4%.', minutes: '8 min', thread: true },
  rows: [
    { slot: 'Review', drill: 'Spot the gap', reason: 'Structure: keep it sharp.', minutes: '5 min' },
    { slot: 'Something new', drill: 'Chart read', reason: 'Exhibits are next week’s focus.', minutes: '7 min' },
  ],
  skill: 'Math setup',
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
  learn: { day: 'Day 2', left: '24 days to go', line: 'Between math reps, a 3-minute lesson on case-specific structure.' },
  drill: { day: 'Day 5', left: '21 days to go', line: 'Math reps: a wrong base is the same kind of setup slip.' },
  mock: { day: 'Day 12', left: '14 days to go', line: 'A new case. He sets up the margin first and gets it right.' },
  adapt: { day: 'Day 12', left: '14 days to go', line: 'Math setup reaches Mastered. The report found his next weak spot.' },
};

// Matt's rewrite (24 Oct 2026): one paragraph per chapter, no bullets.
export const CHAPTERS: Record<string, ChapterCopy> = {
  diagnose: {
    id: 'diagnose', label: '01 · Diagnose', headline: 'Know exactly where you stand',
    body: 'Start with a live mock interview. When you say the margin fell to 4% and the case says 2%, the interviewer asks you to walk through your math, the way a real one would. A short skills check follows, and you leave with a score on each of the 8 skills and a ranked list of what to fix first.',
    bullets: [],
  },
  plan: {
    id: 'plan', label: '02 · Your plan', headline: 'Never guess what to practice next',
    body: 'Tell us your interview date, whether it’s next Friday or next semester, and your plan works backward from it. Each day brings one workout of about 20 minutes: drills on your weakest skill, a quick review of something you’ve already learned, and one thing you haven’t seen yet.',
    bullets: [],
  },
  learn: {
    id: 'learn', label: '03 · Learn', headline: 'Learn what a strong answer sounds like',
    body: 'Each lesson covers one skill in about three minutes. You see a weak answer and a strong answer to the same question, with the difference marked: the weak framework could fit any company, while the strong one is built around this client’s decision. No business background needed.',
    bullets: [],
  },
  drill: {
    id: 'drill', label: '04 · Drill', headline: 'Fix one mistake at a time',
    body: 'Drills are short, timed, and focused on a single skill. Calculate a percent change from the wrong base, and the feedback names that exact mistake and shows the right method before your next question. On harder sets, a follow-up makes you defend your answer, such as which part of your framework you’d investigate first, and why.',
    bullets: [],
  },
  mock: {
    id: 'mock', label: '05 · Mock interview', headline: 'Prove it in a full case',
    body: 'The interviewer shares data only when you ask for the right thing, pushes back when your logic is thin, and runs the case interviewer-led or candidate-led, the two formats firms use. Afterward, each of the 8 skills gets a rating, and every comment quotes the moment in your interview it refers to.',
    bullets: [],
  },
  adapt: {
    id: 'adapt', label: '06 · Plan updates', headline: 'Your next workout comes from your last mistake',
    body: 'If your mock interview shows you mixing up percentages and percentage points, that goes straight into tomorrow’s workout. A skill moves from learning to practiced once you pass it consistently, and to mastered only after you pass it on problems from an industry you haven’t practiced in.',
    bullets: [],
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
  { slot: 'Weak spot', drill: 'Consulting math', reason: 'From your diagnostic: margin was 2%, not 4%.', minutes: '8 min', thread: true },
  { slot: 'Review', drill: 'Spot the gap', reason: 'Structure: keep it sharp.', minutes: '5 min' },
  { slot: 'Something new', drill: 'Chart read', reason: 'Exhibits are next week’s focus.', minutes: '7 min' },
];

// Chapter 03: the product's case-specific structure lesson. The weak answer
// is a plain profit tree that could fit any company; the strong one is built
// around this client's decision.
export const LESSON = {
  meta: 'Lesson · 3 min · Case-specific structure',
  title: 'A structure built for this case',
  prompt: 'A regional gym chain is deciding whether to launch an at-home fitness subscription.',
  weak: { label: 'Weak answer', root: 'Profit', branches: [{ name: 'Revenue', parts: 'price × volume' }, { name: 'Costs', parts: 'fixed + variable' }], note: 'Could fit any company.' },
  strong: {
    label: 'Strong answer',
    buckets: ['Will current members pay for at-home workouts?', 'Who already sells at-home fitness, and at what price?', 'Can the chain film and stream classes well?', 'Does subscription revenue cover production and platform costs?'],
    note: 'Built around this client’s decision.',
  },
};

// Chapter 04: a percent change from the wrong base (the product's "wrong
// base" mistake), on Fresh Basket's profit drop; then a follow-up that makes
// you defend your framework.
export const DRILL = {
  meta: 'Consulting math · Item 2 of 5',
  prompt: 'Profit fell from $3M to $1M. By what percent did it fall?',
  wrong: { answer: '200%', chip: 'Wrong base: percent change divides by the starting value' },
  right: { answer: '67%', chip: 'Correct. $2M ÷ $3M ≈ 67%.' },
  followup: { meta: 'Follow-up · Framework builder', text: 'Which part of your framework would you investigate first, and why?' },
};

// Chapter 05: a later mock on a new case. Math setup holds up; the same
// report catches a new math slip (percent vs. percentage points), which
// chapter 06 picks up.
export const REPORT = {
  case: 'Harbor Coffee',
  rows: [
    { skill: 'Problem structuring', rating: 'Strong' },
    { skill: 'Quantitative rigor', rating: 'Strong', was: 'Day 1: Focus area', thread: true },
    { skill: 'Exhibit interpretation', rating: 'Strong' },
    { skill: 'Business judgment', rating: 'Adequate' },
    { skill: 'Creativity', rating: 'Adequate' },
    { skill: 'Synthesis', rating: 'Adequate' },
    { skill: 'Communication', rating: 'Adequate' },
    { skill: 'Composure under pushback', rating: 'Strong' },
  ],
  stages: ['Structure', 'Math', 'Exhibits', 'Brainstorming', 'Synthesis'],
  quote: 'Costs are 92% of sales, so the margin is 100 minus 92: 8%.',
  point: { label: 'Strength · Quantitative rigor', text: 'Set up the margin before calculating. Right the first time.' },
  closing: 'That’s a strong place to stop. Let’s look at your feedback.',
};

// Chapter 06: Math setup reaches Mastered (it passed in a case he hadn't
// seen); the report's new math slip, percent vs. percentage points, leads
// tomorrow's workout; margin math drops to review.
export const ADAPT = {
  point: { label: 'Work on · Percentages vs. percentage points', text: 'Said the margin “fell 3%”. It fell 3 points, from 11% to 8%.' },
  newRow: { slot: 'Weak spot', drill: 'Mental math', reason: 'From your mock interview: percent vs. percentage points.', minutes: '8 min' },
  rows: [
    { slot: 'Review', drill: 'Consulting math', reason: 'Math setup: mastered. Kept sharp.', minutes: '5 min', thread: true },
    { slot: 'Something new', drill: 'Initial hypothesis', reason: 'Hypotheses are this week’s focus.', minutes: '7 min' },
  ],
  // `thread` climbs last and slowest: the payoff. Percentages is the new weak spot.
  skills: [
    { name: 'Math setup', end: 'mastered', thread: true },
    { name: 'MECE structure', end: 'mastered' },
    { name: 'Chart takeaway', end: 'practiced' },
    { name: 'Case-specific structure', end: 'practiced' },
    { name: 'Complete recommendation', end: 'practiced' },
    { name: 'Percentages', end: 'learning' },
  ] as { name: string; end: 'learning' | 'practiced' | 'mastered'; thread?: true }[],
};

// ---------- Two pages (Matt's brief, 24 Oct 2026) ----------
// The homepage sells the difference; the product page explains how it works
// (the loop and the six chapters, moved there unchanged). Mockup routes stand
// in for / and /product.

// The company name (Matt, 24 Oct 2026: CasePace). Every mention on both
// pages, the product screens included, reads it from here.
export const BRAND = 'CasePace';

// What every "Take the free diagnostic" button says once clicked (Matt, 27 Oct: for now).
export const CONTACT = 'Contact our team to learn more!';

export const HOME_HREF = '/mockups/exhibition';
export const PRODUCT_HREF = '/mockups/exhibition/product';

export const META = {
  home: { title: `${BRAND} | Case interview training built around you`, description: `${BRAND} is a complete case interview training program: a diagnostic, lessons, skill drills and AI mock interviews in one personalized plan that adapts as you improve.` },
  product: { title: `How it works | ${BRAND}`, description: `Every step of the ${BRAND} training loop, from the free diagnostic to your plan, lessons, drills and AI mock interviews, to the skill you finally master.` },
};

export const PRODUCT_INTRO = {
  headline: 'From your first case to offer-ready',
  subhead: 'Every step of the training loop, from the diagnostic to the skill you finally master.',
  primary: 'Take the free diagnostic',
};

export const CLOSE = {
  headline: 'Find out where you stand. It’s free.',
  subhead: 'Take the diagnostic and get a personalized training plan in minutes.',
  primary: 'Take the free diagnostic',
};

// "What sets us apart": Matt's copy, one block per slide (SLIDES below). The
// screens follow Lorenzo's math thread: the Day 1 slip, the plan after his
// Day 12 mock, the lesson and the drill on the slip that mock found (chapter
// 06 on the product page).
export type ScreenId = 'interview' | 'workout' | 'lesson' | 'drill';

export const APART = {
  eyebrow: `Why ${BRAND}`,
  headline: 'Most AI case tools stop at the mock interview. We build the plan that gets you ready.',
  blocks: [
    {
      id: 'apart-interviewer', screens: ['interview'] as ScreenId[],
      title: 'An AI interviewer engineered to interview the way consultants do',
      body: 'It asks for your structure, shares exhibits only when you ask for the right data, and stops you when the math is off. Afterward, every piece of feedback quotes the moment in your interview it refers to.',
    },
    {
      id: 'apart-plan', screens: ['workout'] as ScreenId[],
      title: 'A personalized, adaptive plan so you know what to improve next',
      body: 'Your diagnostic and every case you take reshape what you practice next. Whether your interview is next Friday or next semester, you’ll always know exactly what today’s workout is.',
    },
    {
      id: 'apart-drills', screens: ['lesson', 'drill'] as ScreenId[],
      title: 'A curriculum of lessons and drills, designed to improve your weak spots',
      body: 'Every mistake you make in a case is matched to a short lesson and a set of targeted drills. Learn the concept in about three minutes, then practice it with drills from a library of 200+ that give instant feedback and test whether you really understand.',
    },
  ],
  primary: 'Take the free diagnostic',
  tour: 'See the full product tour',
};

// The slides (Matt's brief, 24 Oct 2026): What sets us apart as three
// stacking consulting slides, one per block, each with its own exhibit.
export const SLIDES = [
  { feature: 'AI Interviewer', sub: 'Live voice', chapter: 'mock', exhibits: [{ id: 'interview', label: 'Exhibit 1', title: 'Live voice interview' }] },
  { feature: 'Adaptive Plan', sub: 'Personalized daily workouts', chapter: 'plan', exhibits: [{ id: 'workout', label: 'Exhibit 2', title: 'Today’s workout' }] },
  { feature: 'Lessons & Drills', sub: 'Targeted curriculum', chapter: 'learn', exhibits: [{ id: 'lesson', label: 'Exhibit 3a', title: 'Lesson' }, { id: 'drill', label: 'Exhibit 3b', title: 'Targeted drill' }] },
] as { feature: string; sub: string; chapter: string; exhibits: { id: ScreenId; label: string; title: string }[] }[];

export const SLIDE_SOURCE = `Source: ${BRAND} sample session`;

// The fourth slide, Under the hood (Matt's brief, 28 Oct 2026): the
// technology as the dark layer under the three feature slides. Its diagram's
// labels live in public/landing/tech-layers.svg, not here.
export const HOOD_ID = 'under-the-hood';
export const HOOD = {
  tracker: 'Under the hood',
  feature: 'Technology',
  sub: 'The foundation of every session',
  title: 'All Engineered for YOU to Succeed',
  body: 'A multi-agent architecture runs each part of your interview, every output is verified, and every mistake becomes a drill built to fix it.',
  button: 'How it works',
  figure: ['FIGURE 1', 'WHAT EVERY SESSION RUNS ON'],
  foot: 'Foundation',
};

export const SCREENS = {
  // The live voice interview (Matt, 24 Oct: voice is live), at the moment
  // the math slip is caught. Same pieces as chapter 01 (voice-call.tsx).
  interview: {
    label: 'The live interview',
    case: 'Fresh Basket',
    time: '12:41',
    lines: [
      { who: 'Interviewer', text: 'Good. Here’s the cost breakdown.' },
      { who: 'You', text: 'So the margin went from 6% to 4%.' },
      { who: 'Interviewer', text: 'Walk me through how you got 4%.' },
    ] as { who: 'Interviewer' | 'You'; text: string }[],
  },
  workout: {
    label: 'Today’s workout',
  },
  lesson: {
    label: 'The lesson',
    meta: 'Percentages · short lesson',
    title: 'Percentages vs. percentage points',
    minutes: '3 min',
    // The idea and the mistake line are the live lesson's (lessons/lesson-qn-percentages.md).
    idea: 'Percent change divides by the starting value, and a change between two percentages is measured in percentage points.',
    example: { setup: 'Margin rose from 6% to 8%.', answer: 'That’s +2 percentage points, or a 33% increase.' },
    mistake: { label: 'Percent vs percentage points', line: 'calling a move from 12% to 15% “3%” when it is 3 percentage points.' },
  },
  drill: {
    label: 'The drill',
    meta: 'Mental math · Item 2 of 5',
    prompt: 'Operating margin rose from 6% to 8%. By how many percentage points did it rise?',
    answer: '33%',
    chip: 'Percent vs. points: that’s the percent change. The question asked for the point change (2).',
    followup: { meta: 'Follow-up', text: 'The CFO tells the board the margin “grew 2%”. What would you say instead, and why?' },
  },
};
