import fs from 'fs';
import path from 'path';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { DrillRunner, type RunnerView } from '@/components/drills/runner';
import { ChatWindow } from '@/components/chat-window';
import { LessonBody } from '@/components/drills/lesson';
import { ReportCard } from '@/components/report-card';
import { StateLegend, TrendArrow, stateStyle } from '@/components/drills/progress';
import { STATE_LABEL, type Arrow } from '@/lib/drills/progress/dashboard';
import type { SkillStateName } from '@/lib/drills/progress/engine';
import { getDrill, getMistakeTag, getSkill } from '@/lib/drills/config';
import { LESSONS_DIR, parseLesson } from '@/lib/drills/lessons';
import type { DimensionFeedback } from '@/lib/scoring/judge';

// Homepage screenshots (20 Oct 2026): the real product components and page
// markup, rendered with SYNTHETIC data so no student's data and no case or
// drill-item content reaches the public page. Local development only
// (`next dev`); scripts/capture-landing-media.ts drives it, stubbing the
// runner's and chat's API calls. Markup outside the shared components is
// copied from the pages named on each screen.

export const dynamic = 'force-dynamic';

const SCREENS = ['hero', 'diagnostic', 'plan', 'lesson', 'drill', 'mock', 'feedback'] as const;
type Screen = typeof SCREENS[number];

const name = (id: string) => getSkill(id).name;

// app/drills/progress/page.tsx's skill-map tile.
function Tile({ id, state, arrow }: { id: string; state: SkillStateName; arrow: Arrow }) {
  return (
    <li>
      <span data-state={state} style={stateStyle(state)} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm">
        <span className="font-medium">{name(id)}</span>
        <span className="flex items-center gap-2 whitespace-nowrap">{STATE_LABEL[state]} <TrendArrow arrow={arrow} /></span>
      </span>
    </li>
  );
}

const MAP: { title: string; skills: [string, SkillStateName, Arrow][] }[] = [
  { title: 'Problem Structuring', skills: [['PS.mece', 'mastered', 'up'], ['PS.case_specific', 'practiced', 'up'], ['PS.depth', 'recognizes', 'flat']] },
  { title: 'Hypothesis', skills: [['HY.form', 'learning', 'none']] },
  { title: 'Quantitative Rigor', skills: [['QN.setup', 'mastered', 'flat'], ['QN.percentages', 'practiced', 'up'], ['QN.magnitude', 'recognizes', 'up']] },
  { title: 'Exhibit Interpretation', skills: [['EX.takeaway', 'learning', 'none']] },
];

function SkillMap({ groups = MAP, cols = 'sm:grid-cols-2' }: { groups?: typeof MAP; cols?: string }) {
  return (
    <section aria-labelledby="map" className="space-y-3">
      <h2 id="map" className="font-medium">Skill map</h2>
      {groups.map(g => (
        <div key={g.title} className="space-y-2">
          <h3 className="text-sm font-semibold">{g.title}</h3>
          <ul className={`grid gap-2 ${cols}`}>
            {g.skills.map(([id, state, arrow]) => <Tile key={id} id={id} state={state} arrow={arrow} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

// app/drills/page.tsx: the training home's header and today's workout.
function Hero() {
  const blocks = [
    { slot: 'Weak spot', drill: 'PS-3', reason: 'Your structures missed a whole bucket in 2 of your last 3 answers.', status: 'Done, 80%' },
    { slot: 'Review', drill: 'EX-1', reason: `${name('EX.takeaway')}: last practiced 9 days ago.`, status: '4 min' },
    { slot: 'Something new', drill: 'HY-2', reason: `${name('HY.form')} is this week’s focus.`, status: '7 min' },
  ];
  return (
    <main className="w-(--screen-w) space-y-6 bg-background p-6">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Standard · Week 2 of 6 · Hypotheses and exhibits</h1>
        <p className="text-sm text-muted-foreground">Interview: Nov 21 (25 days)</p>
      </header>
      <section aria-labelledby="workout" className="space-y-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="workout" className="font-medium">Today&apos;s workout</h2>
          <span className="text-sm text-muted-foreground">About 17 min · 3 sets</span>
        </div>
        <ol className="space-y-3">
          {blocks.map(b => (
            <li key={b.drill} className="space-y-1 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span><span className="text-muted-foreground">{b.slot} · </span><span className="font-medium">{getDrill(b.drill).name}</span></span>
                <span className="text-muted-foreground">{b.status}</span>
              </p>
              <p className="text-muted-foreground">{b.reason}</p>
            </li>
          ))}
        </ol>
        <span className={buttonVariants({ size: 'lg' })}>Continue workout</span>
      </section>
      <SkillMap groups={MAP.slice(0, 3).map(g => ({ ...g, skills: g.skills.slice(0, 2) }))} cols="grid-cols-2" />
    </main>
  );
}

// app/drills/diagnostic/page.tsx, finished.
function Diagnostic() {
  const placements: [string, string, number][] = [
    ['PS.mece', 'Starts with fixing flawed answers', 62],
    ['PS.case_specific', 'Starts with recognizing good answers', 40],
    ['HY.form', 'Starts with building answers (test-out)', 83],
    ['QN.setup', 'Starts with building answers (test-out)', 88],
    ['QN.percentages', 'Starts with fixing flawed answers', 67],
    ['EX.takeaway', 'Starts with recognizing good answers', 33],
    ['SY.answer_first', 'Starts with fixing flawed answers', 58],
  ];
  return (
    <main className="w-(--screen-w) space-y-6 bg-background p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Your starting point</h1>
        <p className="text-sm text-muted-foreground">10 of 10 parts done · 64% overall</p>
      </header>
      <section aria-labelledby="placed" className="space-y-2">
        <h2 id="placed" className="font-medium">Where each skill starts</h2>
        <ul className="divide-y rounded-lg border text-sm">
          {placements.map(([id, place, score]) => (
            <li key={id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
              <span className="font-medium">{name(id)}</span>
              <span className="text-muted-foreground">{place} · {score}%</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">Skills not listed start where your plan begins them.</p>
      </section>
      <div className="flex flex-wrap gap-3">
        <span className={buttonVariants({ size: 'lg' })}>See your plan</span>
        <span className={buttonVariants({ variant: 'outline', size: 'lg' })}>Training home</span>
      </div>
    </main>
  );
}

// app/drills/plan/page.tsx, Sprint track (the days list; shorter than the
// Standard plan's week table, so it reads at row size).
function Plan() {
  const days = [
    ['Oct 20', ['diagnostic', 'case'], 0], ['Oct 21', ['workout'], 30], ['Oct 22', ['case', 'workout'], 15], ['Oct 23', ['workout'], 30],
    ['Oct 24', ['case', 'workout'], 15], ['Oct 25', ['review'], 20], ['Oct 26', ['light_review'], 15],
  ] as const;
  const blocks = [
    { drill: 'PS-1', reason: 'Weak spot: case-specific structure' },
    { drill: 'QN-4', reason: 'Weak spot: math setup' },
    { drill: 'SY-2', reason: 'Review: answer first' },
  ];
  return (
    <main className="w-(--screen-w) space-y-6 bg-background p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Your plan</h1>
        <p className="text-sm text-muted-foreground">Built from your diagnostic.</p>
      </header>
      <section aria-labelledby="track" className="space-y-1 rounded-lg border p-4">
        <h2 id="track" className="font-medium">Sprint · 7 days, until Oct 26</h2>
        <p className="text-sm text-muted-foreground">Interview: Oct 28 (7 days)</p>
      </section>
      <section aria-labelledby="today" className="space-y-1">
        <h2 id="today" className="font-medium">Today: day 2 of 7</h2>
      </section>
      <section aria-labelledby="focus" className="space-y-2">
        <h2 id="focus" className="font-medium">Where you start</h2>
        <ul className="space-y-2">
          <li className="rounded-lg border p-3 text-sm">
            <span className="font-medium">{name('PS.case_specific')}</span> <span className="text-muted-foreground">· {getDrill('PS-1').name}</span>
            <span className="block text-muted-foreground">Your structures were generic in 3 diagnostic answers.</span>
          </li>
        </ul>
      </section>
      <section aria-labelledby="schedule" className="space-y-2">
        <h2 id="schedule" className="font-medium">Your schedule</h2>
        <ol className="space-y-1 text-sm">
          {days.map(([date, activities, minutes], i) => <li key={date} className={i === 1 ? 'font-medium' : ''}>Day {i + 1} ({date}): {activities.join(', ').replace(/_/g, ' ')}{minutes ? `, ${minutes}-minute workout` : ''}</li>)}
        </ol>
      </section>
      <section aria-labelledby="first" className="space-y-3 rounded-lg border p-4">
        <h2 id="first" className="font-medium">Your first workout</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {blocks.map(b => <li key={b.drill}><span className="font-medium">{getDrill(b.drill).name}</span> <span className="text-muted-foreground">· {b.reason}</span></li>)}
        </ol>
        <span className={buttonVariants({ size: 'lg' })}>Start first workout</span>
      </section>
    </main>
  );
}

// app/drills/learn/[skillId]/page.tsx, full lesson (a real lesson: lessons are
// teaching content every student sees, not student data).
function Lesson() {
  const file = 'lesson-ps-mece.md';
  const lesson = parseLesson(path.join('lessons', file), fs.readFileSync(path.join(LESSONS_DIR, file), 'utf-8'));
  return (
    <main className="w-(--screen-w) space-y-8 bg-background p-6">
      <LessonBody lesson={{ ...lesson, skill_name: name(lesson.skill_id), mistakes: lesson.mistakes.map(m => ({ ...m, label: getMistakeTag(m.tag)?.label ?? m.tag })) }} mode="full" />
    </main>
  );
}

// app/drills/sets/[setId]/page.tsx: the runner on a synthetic Framework
// builder item with the Defend follow-up; the capture script answers its API calls.
function Drill() {
  const view: RunnerView = {
    set_id: 'demo', diagnostic: null, lesson_skill: null, position: 0, size: 4,
    drill: { id: 'PS-3', name: getDrill('PS-3').name, level: 2 },
    skills: [{ id: 'PS.mece', name: name('PS.mece') }, { id: 'PS.case_specific', name: name('PS.case_specific') }],
    focus_skill: 'PS.mece', time_limit_ms: 180_000, stage_limits_ms: [], ai_graded: true, pass_bar: 0.7,
    example: null, repair_hint: null, defend: { type: 'justify', seconds: 60, max_words: 60 },
    untimed: false, timer_hidden: false, timer_choice_open: false, feedback_mode: 'immediate',
  };
  return (
    <main className="w-(--screen-w) space-y-6 bg-background p-6">
      <DrillRunner view={view} />
    </main>
  );
}

// app/case/[sessionId]/page.tsx: a synthetic case in text mode.
function Mock() {
  return (
    <div className="flex h-[460px] w-(--screen-w) flex-col bg-background">
      <header className="border-b px-4 py-3">
        <div className="text-sm font-medium text-neutral-700">Case Interview — analysis phase</div>
      </header>
      <div className="min-h-0 flex-1">
        <ChatWindow sessionId="demo" initialMessage="Our client is a regional bakery chain. Revenue is flat, but profit fell by a third last year. They want to know why, and what to do about it. How would you approach this?" />
      </div>
    </div>
  );
}

// The report page's rubric card next to Your progress's skill map.
function Feedback() {
  return (
    <main className="w-(--screen-w) space-y-6 bg-background p-6">
      <ReportCard
        label="Problem Structuring"
        rating="strong"
        legacyEvidence={null}
        feedback={{
          rating: 'strong' as DimensionFeedback['rating'],
          wentWell: [{ point: 'Split profit into revenue and costs, then broke costs down by input before asking for data.', quotes: ['Let me look at revenue and costs separately, and on costs, ingredients, labor and delivery.'] }],
          needsWork: [{ point: 'Didn’t say which bucket to test first or why.', quotes: ['I’d look at all of these.'] }],
          missedOpportunities: [],
        }}
      />
      <section className="space-y-3 rounded-lg border p-4">
        <SkillMap groups={[MAP[0], MAP[2]].map(g => ({ ...g, skills: g.skills.slice(0, 2) }))} cols="grid-cols-2" />
        <StateLegend />
      </section>
    </main>
  );
}

// `?w=360` renders the narrow version the homepage shows on phones.
// `?theme=ink-cobalt`: the homepage mockups' palette (Matt, 21 Oct) laid over
// the same components — tokens remapped, skill states Sky (learning) → Cobalt
// (practiced) → green (mastered). Mockup captures only; the product is untouched.
const INK_COBALT = `
[data-theme="ink-cobalt"] {
  --foreground: #0E1424; --card-foreground: #0E1424; --background: #FFFFFF; --card: #FFFFFF;
  --primary: #2D4BD8; --primary-foreground: #FFFFFF; --secondary: #DCE5FF; --secondary-foreground: #0E1424;
  --muted: #F7F7F4; --muted-foreground: color-mix(in oklch, #0E1424 66%, #FFFFFF);
  --border: color-mix(in oklch, #0E1424 13%, #FFFFFF); --input: color-mix(in oklch, #0E1424 18%, #FFFFFF); --ring: #2D4BD8;
  color: #0E1424;
}
[data-theme="ink-cobalt"] [data-state] { background: #DCE5FF !important; color: #0E1424 !important; }
[data-theme="ink-cobalt"] [data-state="practiced"] { background: #2D4BD8 !important; color: #FFFFFF !important; }
[data-theme="ink-cobalt"] [data-state="mastered"], [data-theme="ink-cobalt"] [data-state="validated"] { background: #1F9D63 !important; color: #0E1424 !important; }
`;

export default async function LandingScreen({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ w?: string; theme?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { screen } = await params;
  if (!SCREENS.includes(screen as Screen)) notFound();
  const sp = await searchParams;
  const theme = sp.theme === 'ink-cobalt' ? 'ink-cobalt' : undefined;
  const asked = Number(sp.w);
  const width = asked >= 320 && asked <= 640 ? asked : screen === 'hero' ? 640 : 560;
  const pages: Record<Screen, () => React.ReactNode> = { hero: Hero, diagnostic: Diagnostic, plan: Plan, lesson: Lesson, drill: Drill, mock: Mock, feedback: Feedback };
  return (
    <div id="screen" className="inline-block" data-theme={theme} style={{ '--screen-w': `${width}px` } as React.CSSProperties}>
      {theme && <style>{INK_COBALT}</style>}
      {pages[screen as Screen]()}
    </div>
  );
}
