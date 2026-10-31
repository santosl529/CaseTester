// The homepage's copy and media (Matt's final brief, 21 Oct 2026). Some lines
// describe what isn't built yet; Matt's ruling was to build them as written,
// and each is a launch blocker in the PRD (§16, 21 Oct). Screens are real product UI rendered locally
// with synthetic data (scripts/capture-landing-media.ts); no real student's
// data appears.

export const DIAGNOSTIC_HREF = '/sign-in?next=/drills/diagnostic';

export const STATS = [
  { value: '8', label: 'Skills, trained to the consulting standard' },
  { value: '20+', label: 'Lessons, from first principles to offer-level' },
  { value: '200+', label: 'Drills built to close your gaps' },
  { value: '10+', label: 'Industries, with the nuances interviewers want' },
  { value: '24/7', label: 'Practice whenever you’re ready' },
] as const;

export interface Media {
  kind: 'image' | 'video';
  src: string;
  // The still shown before a video loads, and in place of it under reduced motion.
  poster?: string;
  width: number;
  height: number;
  // A narrower capture (360px wide, cropped to what proves the row) shown
  // below 1024px, where rows stack, so the text in it reads on phones and tablets. The alt covers both.
  mobile: { src: string; poster?: string; width: number; height: number };
  alt: string;
}

export const HERO_MEDIA: Media = {
  kind: 'image',
  src: '/landing/hero.png',
  width: 1280,
  height: 1372,
  mobile: { src: '/landing/hero-m.png', width: 720, height: 900 },
  alt: 'A student’s training home in CaseTester: week 2 of a 6-week Standard plan, and today’s workout of three drills, one done at 80%, with a Continue workout button.',
};

export interface LoopStep {
  id: string;
  label: string;
  description: string;
}

export const DIAGNOSTIC_STEP: LoopStep = {
  id: 'diagnostic',
  label: 'Free diagnostic',
  description: 'Benchmark yourself on the 8 skills top firms test.',
};

export const LOOP_STEPS: LoopStep[] = [
  { id: 'plan', label: 'Your plan', description: '1 week, 2 weeks, 3 months, or anywhere in between, built around your gaps.' },
  { id: 'learn', label: 'Learn', description: 'Sharp, focused lessons. No business background required.' },
  { id: 'drill', label: 'Drill', description: 'Targeted reps on one skill at a time until it’s automatic.' },
  { id: 'mock', label: 'Mock interview', description: 'A full case with an AI interviewer that pushes back like a real consultant.' },
];

export const UPDATE_STEP: LoopStep = {
  id: 'feedback',
  label: 'Plan updates',
  description: 'Every result recalibrates your plan to what’s holding you back now.',
};

export const LEVELS = [
  { name: 'Recognize', description: 'Spot what good looks like.', example: 'Which of these structures is stronger, and why?' },
  { name: 'Generate', description: 'Produce it yourself, one skill at a time.', example: 'Build a structure for this problem.' },
  { name: 'Perform', description: 'Use every skill at once in a full mock interview, under pressure.', example: null },
] as const;

export const POINTS = [
  { title: 'Built around you', body: 'Every diagnostic, drill, and case sharpens your skill profile, so your training always targets what’s holding you back.' },
  { title: 'The complete toolkit', body: 'From mental math to final recommendations, every skill you’ll be tested on, trained in depth.' },
  { title: 'Beyond the frameworks', body: 'Generic frameworks get generic answers. Learn the industry nuances that make interviewers lean in.' },
  { title: 'Mastery you can prove', body: 'You don’t move on because you finished a drill. You move on when you can use the skill in a live case.' },
] as const;

export const SKILLS = [
  { name: 'Problem structuring', line: 'Break any problem into a clear, logical plan of attack.' },
  { name: 'Quantitative rigor', line: 'Run the numbers fast and accurately under pressure.' },
  { name: 'Exhibit interpretation', line: 'Pull the key insight out of any chart or table.' },
  { name: 'Business judgment', line: 'Know what matters and why.' },
  { name: 'Creativity', line: 'Generate ideas interviewers haven’t heard ten times today.' },
  { name: 'Synthesis', line: 'Land a crisp, confident recommendation.' },
  { name: 'Communication', line: 'Think out loud clearly and lead the conversation.' },
  { name: 'Composure under pushback', line: 'Hold your ground, or adjust smartly, when challenged.' },
] as const;

// "The technology" (brief §7). Deliberately non-specific: no model names,
// thresholds or pipeline step counts (Matt, 21 Oct). Labels and tags are set
// in capitals by CSS, so screen readers get words, not letters.
export const TECH = [
  {
    n: '01', label: 'Grounded interview engine', title: 'Built-In Accuracy',
    body: 'Case data is protected by design, so the interviewer shares only what’s in the case, when you’ve earned it. Every reply is checked before you see it, and your math is held to the same standard a real interviewer would use.',
    tags: ['Grounded generation', 'Real-time safeguards'],
  },
  {
    n: '02', label: 'Multi-agent architecture', title: 'A Team Behind Every Interview',
    body: 'Specialized AI agents work together in real time, each focused on a different part of the interview. Nothing you ask gets lost, every skill gets tested before the case ends, and when you’re stuck, you get just enough help to keep moving.',
    tags: ['Multi-agent orchestration', 'Adaptive dialogue'],
  },
  {
    n: '03', label: 'Verified feedback pipeline', title: 'Feedback You Can Trust',
    body: 'Your feedback report passes through a multi-stage verification pipeline before you see it, confirming every quote is real, every claim matches your transcript, and nothing contradicts itself. Built-in fairness rules make sure you’re judged on what you said and what you had the chance to show, nothing else.',
    tags: ['Evidence verification', 'Fairness safeguards'],
  },
  {
    n: '04', label: 'Adaptive mastery engine', title: 'Diagnose, Prescribe, Prove It',
    body: 'Every mistake is mapped to one of 60+ error types across a connected skill graph, and mistakes from your cases become targeted drills tied to the moment that triggered them. Stuck? The engine routes you to the missing foundation. Skills count as mastered only when you pass unseen problems in a new industry.',
    tags: ['Adaptive learning', 'Mastery tracking'],
  },
] as const;

export interface ProductRow {
  id: string;
  step: string;
  headline: string;
  body: string;
  bullets: string[];
  media: Media;
}

export const ROWS: ProductRow[] = [
  {
    id: 'diagnostic',
    step: 'Step 1 · Diagnostic',
    headline: 'Know exactly where you stand',
    body: 'A free assessment benchmarks you on the 8 skills top firms test, so your training starts from your real gaps, not guesses.',
    bullets: [
      'Your score on every skill, from structuring to synthesis',
      'Your biggest gaps, ranked',
      'A recommended plan built from your results',
    ],
    media: {
      kind: 'image',
      src: '/landing/diagnostic.png',
      width: 1120,
      height: 1120,
      mobile: { src: '/landing/diagnostic-m.png', width: 720, height: 882 },
      alt: 'Diagnostic results: all 10 parts done, 64% overall, and where each skill starts. For example, MECE structure starts with fixing flawed answers, and Math setup with building answers.',
    },
  },
  {
    id: 'plan',
    step: 'Step 2 · Your plan',
    headline: 'Never guess what to practice next',
    body: 'Most students waste hours deciding what to work on. Your plan decides for you, built around your timeline and your gaps, whether your interview is next week or three months away.',
    bullets: [
      'A daily workout that tells you exactly what to do today',
      'Plans from 1 week to 3 months, or anywhere in between',
      'Recalibrates automatically as you improve',
    ],
    media: {
      kind: 'image',
      src: '/landing/plan.png',
      width: 1120,
      height: 1612,
      mobile: { src: '/landing/plan-m.png', width: 720, height: 1092 },
      alt: 'A 7-day Sprint plan: a day-by-day schedule of workouts, cases and reviews, and the first workout of three drills with a Start button.',
    },
  },
  {
    id: 'learn',
    step: 'Step 3 · Lessons',
    headline: 'Master the concepts behind every great answer',
    body: '20+ focused lessons show you what interviewers reward and why, with strong and weak answers side by side.',
    bullets: [
      'No business background required',
      'Real examples of what offer-level answers sound like',
      'Industry-specific insight, not recycled frameworks',
    ],
    media: {
      kind: 'image',
      src: '/landing/lesson.png',
      width: 1120,
      height: 668,
      mobile: { src: '/landing/lesson-m.png', width: 720, height: 988 },
      alt: 'A lesson’s worked example for a library whose checkouts fell 20%: a first draft whose buckets overlap, then a better version with three clear buckets.',
    },
  },
  {
    id: 'drill',
    step: 'Step 4 · Drills',
    headline: 'Practice with purpose',
    body: '200+ targeted drills train one skill at a time, from mental math to market sizing to reading charts. Then you’ll defend your answer, just like in the real interview.',
    bullets: [
      'Mental math, market sizing, case math, and chart reading',
      'Follow-up questions that test real understanding',
      'Instant feedback on every rep',
    ],
    media: {
      kind: 'video',
      src: '/landing/drill.webm',
      poster: '/landing/drill.png',
      width: 1120,
      height: 1200,
      mobile: { src: '/landing/drill-m.webm', poster: '/landing/drill-m.png', width: 720, height: 1360 },
      alt: 'A Framework builder drill on why a bike-share program’s rides fell. The student submits a three-bucket structure, the interviewer follows up with “Which bucket would you dig into first, and why?”, and the student types a short defense.',
    },
  },
  {
    id: 'mock',
    step: 'Step 5 · Mock interview',
    headline: 'An AI interviewer that plays it like the real thing',
    body: 'It behaves like a real consultant: challenging weak logic, responding to what you actually say, sharing exhibits when you ask for the right data, and catching math errors the way a real interviewer would.',
    bullets: [
      'Pushes back and asks follow-ups, just like the real interview',
      'Grounded in real case data, not improvised numbers',
      'Interviewer-led or candidate-led, the two formats firms use',
    ],
    media: {
      kind: 'video',
      src: '/landing/mock.webm',
      poster: '/landing/mock.png',
      width: 1120,
      height: 920,
      mobile: { src: '/landing/mock-m.webm', poster: '/landing/mock-m.png', width: 760, height: 920 },
      alt: 'A mock interview in text mode on a bakery chain’s falling profit. The candidate asks how each cost has changed, and the interviewer replies with an exhibit: costs as a share of revenue, last year and this year.',
    },
  },
  {
    id: 'feedback',
    step: 'Step 6 · Feedback',
    headline: 'Feedback that pinpoints exactly what to fix',
    body: 'Not a generic score. After every case, you get a breakdown of every skill and every stage of the interview, from your opening structure to your final recommendation, tied to the moments that mattered.',
    bullets: [
      'Scored on all 8 skills',
      'Stage-by-stage breakdown: structure, math, exhibits, brainstorming, synthesis',
      'Specific next steps that feed straight into your plan',
    ],
    media: {
      kind: 'image',
      src: '/landing/feedback.png',
      width: 1120,
      height: 1236,
      mobile: { src: '/landing/feedback-m.png', width: 720, height: 728 },
      alt: 'A feedback report card for Problem Structuring rated strong, with what went well and what needs work, each backed by a quote from the candidate.',
    },
  },
];
