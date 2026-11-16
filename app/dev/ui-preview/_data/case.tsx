import { caseTotalMs } from '@/lib/orchestrator/state-machine';
import { HomeView } from '@/components/home-view';
import { SignInFlow } from '@/components/sign-in-flow';
import { StartCaseScreen, TextCaseScreen, VoiceCaseScreen } from '@/components/views/case';
import { ReportScreen, UnscoredReportScreen } from '@/components/views/report';
import { StatusScreen } from '@/components/views/status';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import { FIRST_CASE_ID, byDifficulty, listedCases, linkOnlyCase } from '@/lib/cases/listed';
import { getCaseById } from '@/lib/cases/loader';
import type { ReportDimension } from '@/lib/scoring/report-dimensions';
import type { ReportDrillsView } from '@/lib/drills/progress/report-view';
import type { NextStepsSnapshot } from '@/lib/drills/next-steps';
import type { Screen } from '../_lib/types';

// Sign-in, /home and the interview: sample data, a sample case conversation
// (written for the preview, not taken from a case's ledger).

const TEXT_ID = 'preview-text';
const OPENING = 'Thanks for joining. Here is the case: Brew & Bean, a specialty coffee chain with 200 locations across the US, has seen its net profit margin fall from 24% to 6% over two years, even though revenue grew 15%. The CEO wants to know why, and what to do about it. How would you approach this?';

const turn = (interviewerText: string, extra: Record<string, unknown> = {}) => ({ interviewerText, ended: false, ...extra });

const EXHIBIT = {
  id: 'preview-costs', title: 'Cost structure, % of revenue', chartType: 'table',
  data: [
    { 'Cost line': 'Coffee beans and milk', 'FY2023': '28%', 'FY2025': '31%' },
    { 'Cost line': 'Store labor', 'FY2023': '24%', 'FY2025': '33%' },
    { 'Cost line': 'Rent', 'FY2023': '14%', 'FY2025': '15%' },
    { 'Cost line': 'Corporate overhead', 'FY2023': '10%', 'FY2025': '15%' },
  ],
  notes: 'Sample data for the preview.',
};

const DIMENSIONS: ReportDimension[] = [
  {
    key: 'structure', label: 'Problem structuring', rating: 'strong', legacyEvidence: null,
    feedback: {
      rating: 'strong', missedOpportunities: [],
      wentWell: [{ point: 'Split profit into revenue and costs, then costs into fixed and variable.', quotes: ['I’d split profit into revenue and costs, and look at costs by store and corporate.'],
        plain: { where: 'Your opening structure', what: 'You split profit into revenue and costs, then broke costs down by store and corporate.', why: 'It let you find the labor jump in one step.', next: 'Keep naming why each branch matters to the CEO’s question.' } }],
      needsWork: [],
    },
  },
  {
    key: 'quantitative', label: 'Quantitative rigor', rating: 'needs_work', legacyEvidence: null,
    feedback: {
      rating: 'needs_work', wentWell: [],
      needsWork: [{ point: 'Said the margin fell to 4% when the exhibit showed 6%.', quotes: ['So the margin is down to about 4%.'],
        plain: { where: 'Exhibit 1, the cost structure', what: 'You said the margin fell to 4%. Costs rose from 76% to 94% of revenue, so it fell to 6%.', why: 'A wrong base changes how big the problem looks.', next: 'Next time, try writing the base down before you calculate.' } }],
      missedOpportunities: [{ moment: 'After the labor line', betterResponse: 'Labor went from 24% to 33% of revenue: that is nine of the eighteen points we lost.' }],
    },
  },
  {
    key: 'dataExhibit', label: 'Exhibit interpretation', rating: 'meets_bar', legacyEvidence: null,
    feedback: {
      rating: 'meets_bar', missedOpportunities: [], needsWork: [],
      wentWell: [{ point: 'Spotted that labor was the biggest mover.', quotes: ['Labor is the line that moved the most.'] }],
    },
  },
  { key: 'judgment', label: 'Business judgment', rating: 'meets_bar', legacyEvidence: null, feedback: { rating: 'meets_bar', wentWell: [{ point: 'Asked whether new stores were less mature.', quotes: ['Are the newer stores still ramping up?'] }], needsWork: [], missedOpportunities: [] } },
  { key: 'creativity', label: 'Creativity', rating: null, legacyEvidence: null, feedback: { rating: 'meets_bar', notAssessed: true, coverageCaveat: 'The interview ended before the brainstorm, so this skill was not assessed.', wentWell: [], needsWork: [], missedOpportunities: [] } },
  { key: 'synthesis', label: 'Synthesis', rating: 'meets_bar', legacyEvidence: null, feedback: { rating: 'meets_bar', wentWell: [{ point: 'Led the recommendation with the answer.', quotes: ['My recommendation is to fix labor scheduling first.'] }], needsWork: [], missedOpportunities: [] } },
  { key: 'communication', label: 'Communication', rating: 'strong', legacyEvidence: null, feedback: { rating: 'strong', wentWell: [{ point: 'Signposted each step before taking it.', quotes: ['First I’ll look at costs, then come back to revenue.'] }], needsWork: [], missedOpportunities: [] } },
  { key: 'pushback', label: 'Handling pushback', rating: 'meets_bar', legacyEvidence: null, feedback: { rating: 'meets_bar', wentWell: [], needsWork: [], missedOpportunities: [] } },
];

const TURNS = [
  { role: 'interviewer', text: OPENING },
  { role: 'candidate', text: 'I’d split profit into revenue and costs, and look at costs by store and corporate.' },
  { role: 'interviewer', text: 'Good. Revenue grew, so let’s look at costs. Here is how they’ve moved.' },
  { role: 'candidate', text: 'Labor is the line that moved the most. So the margin is down to about 4%.' },
  { role: 'interviewer', text: 'Walk me through how you got 4%.' },
].map((t, i) => ({ id: `t${i}`, ...t, clock: `${Math.floor(i * 47 / 60)}:${String((i * 47) % 60).padStart(2, '0')}` }));

// The Cases page's sample: listed cases at their real lengths, with finished attempts.
const homeCases = (attempts: Record<string, { done: number; last: string }>) => byDifficulty(listedCases()).map(c => ({
  ...c, minutes: Math.round(caseTotalMs(getCaseById(c.id)) / 60_000), done: attempts[c.id]?.done ?? 0, last: attempts[c.id]?.last ?? null, first: c.id === FIRST_CASE_ID,
}));
const PAST = [
  { id: 'p1', date: 'Nov 12, 2026', caseTitle: 'Brew & Bean Profitability', status: 'Not finished', link: null },
  { id: 'p2', date: 'Nov 10, 2026', caseTitle: 'Brew & Bean Profitability', status: 'Completed', link: { href: '/case/p2/report', label: 'View report' } },
  { id: 'p3', date: 'Nov 8, 2026', caseTitle: 'Larkspur Air Route Profitability', status: 'Ended early', link: { href: '/case/p3/report', label: 'Get my report' } },
  { id: 'p4', date: 'Nov 6, 2026', caseTitle: 'Brew & Bean Profitability', status: 'Completed', link: { href: '/case/p4/report', label: 'View report' } },
  { id: 'p5', date: 'Nov 4, 2026', caseTitle: 'Larkspur Air Route Profitability', status: 'Completed', link: { href: '/case/p5/report', label: 'View report' } },
  { id: 'p6', date: 'Nov 1, 2026', caseTitle: 'Brew & Bean Profitability', status: 'Ended — no report', link: null },
  { id: 'p7', date: 'Oct 29, 2026', caseTitle: 'Quillpath SaaS Starter Plan Pricing', status: 'Ended', link: null },
];


// Case results → drills (Matt, 15 Nov): the report's comparison and next steps, as on the mockup.
const CASE_ID = '00000000-0000-4000-8000-0000000000aa';
const SNAPSHOT: NextStepsSnapshot = {
  version: 1, all_clear: false, partial: false, retake: false,
  skills: [
    { skill_id: 'QN.percentages', name: 'Percentages', why: 'You mixed up percent and percentage points.', quote: 'margin went from 18% to 12%, so it dropped 6 percent', prescription_id: '00000000-0000-4000-8000-0000000000b1', lesson: { minutes: 3 }, practice: { drill_name: 'Mental math', level: 2, minutes: 8 } },
    { skill_id: 'PS.mece', name: 'MECE structure', why: 'Two of your buckets overlapped.', quote: 'I’d look at revenue, costs, and then also pricing', prescription_id: '00000000-0000-4000-8000-0000000000b2', lesson: { minutes: 3 }, practice: { drill_name: 'Fix the framework', level: 2, minutes: 10 } },
    { skill_id: 'SY.answer_first', name: 'Answer first', why: 'Your recommendation came at the end instead of first.', quote: 'so looking at everything, there are a few things, and overall I think they should launch', prescription_id: '00000000-0000-4000-8000-0000000000b3', lesson: { minutes: 3 }, practice: { drill_name: 'Fix the recommendation', level: 2, minutes: 7 } },
  ],
  also: { skill_id: 'BJ.risks', name: 'Risks and next steps', why: 'Your risk could apply to any company.', quote: 'the main risk is the economy could change', lesson: null, tip: 'Next time, name a risk that only this company faces, such as the shelf-space fee in Exhibit 2.' },
};
const COMPARISON: NonNullable<ReportDrillsView['comparison']> = {
  kind: 'same_level', previousTitle: 'Larkspur Air Route Profitability',
  previous: { sessionId: 'prev', caseId: 'prof-002', tier: 1, completedAt: new Date('2026-11-03T15:00:00Z'), ratings: {}, partial: false },
  rows: [
    { dimension: 'structure', before: 'needs_work', after: 'meets_bar', move: 1, sets: 4 },
    { dimension: 'quantitative', before: 'meets_bar', after: 'meets_bar', move: 0, sets: 0 },
    { dimension: 'dataExhibit', before: 'meets_bar', after: 'strong', move: 1, sets: 2 },
    { dimension: 'judgment', before: 'meets_bar', after: 'needs_work', move: -1, sets: 0 },
    { dimension: 'creativity', before: 'meets_bar', after: 'meets_bar', move: 0, sets: 0 },
    { dimension: 'synthesis', before: 'needs_work', after: 'needs_work', move: 0, sets: 0 },
    { dimension: 'communication', before: 'strong', after: 'strong', move: 0, sets: 0 },
    { dimension: 'pushback', before: 'meets_bar', after: 'strong', move: 1, sets: 0 },
  ],
};
const STRENGTHS = [
  { label: 'Data & Exhibit Interpretation', text: 'You read Exhibit 2’s trend and named what it meant for the launch.', quote: 'shelf share is flat but velocity is up, so the issue is distribution, not demand' },
  { label: 'Communication & Delivery', text: 'Your answers were short and clear throughout.', quote: null },
];
const ready = (snapshot: NextStepsSnapshot, extra: Partial<Extract<NonNullable<ReportDrillsView['nextSteps']>, { state: 'ready' }>> = {}): NonNullable<ReportDrillsView['nextSteps']> =>
  ({ state: 'ready', caseAttemptId: CASE_ID, snapshot, done: ['QN.percentages'], ready: false, minutes: 34, nextCase: { title: 'Brew & Bean Profitability', difficulty: 'Medium' }, strengths: STRENGTHS, ...extra });
const reportWith = (slug: string, title: string, drills: ReportDrillsView) => ({
  slug, path: `/case/${CASE_ID}/report`, area: 'Feedback', title,
  render: () => ({
    node: <ReportScreen sessionId={CASE_ID} caseTitle="Hollis Bay Snacks New Product Launch" partial={drills.nextSteps?.state === 'ready' && drills.nextSteps.snapshot.partial} overallRating="meets_bar" hasTopFix
      topFix={{ where: 'The math on the margin change', what: 'You called a drop from 18% to 12% “6 percent”.', why: 'It is 6 percentage points, a third of the margin.', next: 'Next time, say “points” for a change in a percentage.' }}
      topFixLine={null} dimensions={DIMENSIONS} modelAnswer={null} turns={[]} drills={drills} />,
    api: [{ method: 'POST', path: '/api/(feedback|drills/next-steps|drills/sets).*', body: { ok: true } }],
  }),
});

export const CASE_SCREENS: Screen[] = [
  { slug: 'sign-in', path: '/sign-in', area: 'Auth', title: 'Sign in', render: () => ({ node: <SignInFlow initialStep="auth" next="/home" /> }) },
  { slug: 'sign-in-club', path: '/sign-in', area: 'Auth', title: 'Sign in: club code', render: () => ({ node: <SignInFlow initialStep="club" next="/home" /> }) },
  {
    slug: 'home', path: '/home', area: 'Plan and dashboard', title: 'Cases (after sign-in)',
    render: () => ({ node: <HomeView cases={homeCases({ 'prof-001': { done: 2, last: 'p2' } })} past={PAST.slice(0, 3)} left={{ n: 1, scope: 'day', perDay: 2, block: null }} /> }),
  },
  {
    slug: 'home-many', path: '/home', area: 'Plan and dashboard', title: 'Cases: more than five past sessions, limit reached',
    render: () => ({ node: <HomeView cases={homeCases({ 'prof-001': { done: 3, last: 'p2' }, 'prof-002': { done: 2, last: 'p5' } })} past={PAST} left={{ n: 0, scope: 'day', perDay: 2, block: { reason: 'daily', limit: 2, retryAt: '2026-11-14T15:30:00.000Z' } }} /> }),
  },
  {
    slug: 'start-case', path: '/start/prof-001-demo', area: 'Mock interview', title: 'Start a link-only case',
    render: () => ({ node: <StartCaseScreen c={linkOnlyCase('prof-001-demo') ?? listedCases()[0]} minutes={7} /> }),
  },
  {
    slug: 'text-case', path: '/case/preview-text', area: 'Mock interview', title: 'Text interview (type a reply to see an exhibit)',
    render: () => ({
      node: <TextCaseScreen sessionId={TEXT_ID} active completed={false} casePrompt={getCaseById('prof-001').prompt} initialMessage={OPENING} />,
      api: [{
        method: 'POST', path: `/api/channel/${TEXT_ID}/turn`, delayMs: 900, sequence: [
          turn('Good. Revenue grew, so let’s look at costs. Here is how they’ve moved over the two years.', { exhibit: EXHIBIT }),
          turn('Walk me through how you got that number.'),
          turn('Thanks. That’s the end of our time. You’ll get your feedback report shortly.', { ended: true }),
        ],
      }, { method: 'POST', path: `/api/channel/${TEXT_ID}/(finalize|score)`, delayMs: 1200, body: { ok: true } },
      { method: 'POST', path: `/api/channel/${TEXT_ID}/end`, body: { status: 'completed', report: true } }],
    }),
  },
  {
    slug: 'text-case-ended', path: '/case/preview-ended', area: 'Mock interview', title: 'Text interview: the end screen',
    render: () => ({ node: <TextCaseScreen sessionId="preview-ended" active={false} completed casePrompt={getCaseById('prof-001').prompt} initialMessage={OPENING} /> }),
  },
  {
    slug: 'voice', path: '/case/preview-voice/voice', area: 'Mock interview', title: 'Voice interview, before connecting',
    render: () => ({ node: <VoiceCaseScreen sessionId="preview-voice" active completed={false} casePrompt={getCaseById('prof-001').prompt} consented={false} /> }),
  },
  {
    slug: 'report', path: '/case/preview-report/report', area: 'Feedback', title: 'Feedback report',
    render: () => ({
      node: <ReportScreen sessionId="preview-report" caseTitle="Brew & Bean Profitability" partial={false} overallRating="meets_bar" hasTopFix
        topFix={{ where: 'Exhibit 1, the cost structure', what: 'You said the margin fell to 4%; it fell to 6%.', why: 'Costs rose from 76% to 94% of revenue.', next: 'Next time, set up the margin before you calculate.' }}
        topFixLine={null} dimensions={DIMENSIONS}
        modelAnswer={{ structure: 'Profit = revenue − costs. Revenue grew, so costs: store costs (labor, ingredients, rent) and corporate overhead, each as a share of revenue.', recommendation: 'Fix labor scheduling in the newest stores first: labor explains half of the lost margin. Then review the overhead added for expansion.' }}
        turns={TURNS} />,
      api: [{ method: 'POST', path: '/api/feedback/preview-report', body: { ok: true } }],
    }),
  },
  {
    slug: 'not-found', area: 'Other', title: 'Not found (404)',
    render: () => ({ node: <StatusScreen code="404" title="This page could not be found." body="The link may be out of date, or the page has moved."><Link href="/" className={buttonVariants({ size: 'lg' })}>Go to the homepage</Link></StatusScreen> }),
  },
  {
    slug: 'error', area: 'Other', title: 'Error page',
    render: () => ({ node: <StatusScreen code="Error" title="Something went wrong." body="This page didn’t load. Try again, or go back to the homepage."><span className={buttonVariants({ size: 'lg' })}>Try again</span><Link href="/" className="link t-body">Go to the homepage</Link></StatusScreen> }),
  },
  { slug: 'report-unscored', path: '/case/preview-unscored/report', area: 'Feedback', title: 'Feedback report, not prepared yet', render: () => ({ node: <UnscoredReportScreen sessionId="preview-unscored" caseTitle="Brew & Bean Profitability" /> }) },  reportWith('report-next-steps', 'Feedback report: your next steps (case results → drills on)', { comparison: COMPARISON, nextSteps: ready(SNAPSHOT) }),
  reportWith('report-next-steps-ready', 'Feedback report: every skill done, ready for the next case', { comparison: COMPARISON, nextSteps: ready({ ...SNAPSHOT, also: null }, { done: SNAPSHOT.skills.map(x => x.skill_id), ready: true }) }),
  reportWith('report-next-steps-clear', 'Feedback report: nothing needs practice', { comparison: null, nextSteps: ready({ ...SNAPSHOT, skills: [], also: null, all_clear: true }, { done: [], ready: true, nextCase: { title: 'Quillpath SaaS Starter Plan Pricing', difficulty: 'Hard' } }) }),
  reportWith('report-next-steps-partial', 'Feedback report: ended early, one skill, all cases taken', { comparison: null, nextSteps: ready({ ...SNAPSHOT, skills: [SNAPSHOT.skills[1]], also: null, partial: true }, { done: [], minutes: 13, nextCase: 'all_taken', strengths: [] }) }),
  reportWith('report-next-steps-retake', 'Feedback report: a retake, compared with the last attempt', { comparison: { ...COMPARISON, kind: 'same_case', previousTitle: 'Hollis Bay Snacks New Product Launch' }, nextSteps: ready(SNAPSHOT, { done: [] }) }),
  reportWith('report-next-steps-preparing', 'Feedback report: next steps being prepared', { comparison: COMPARISON, nextSteps: { state: 'preparing' } }),
  reportWith('report-next-steps-failed', 'Feedback report: next steps failed, Try again', { comparison: null, nextSteps: { state: 'failed' } }),
];
