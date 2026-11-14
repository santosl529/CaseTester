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
    render: () => ({ node: <VoiceCaseScreen sessionId="preview-voice" active completed={false} casePrompt={getCaseById('prof-001').prompt} /> }),
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
  { slug: 'report-unscored', path: '/case/preview-unscored/report', area: 'Feedback', title: 'Feedback report, not prepared yet', render: () => ({ node: <UnscoredReportScreen sessionId="preview-unscored" caseTitle="Brew & Bean Profitability" /> }) },
];
