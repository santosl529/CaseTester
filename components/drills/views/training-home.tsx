import Link from 'next/link';
import { getDrill } from '@/lib/drills/config';
import { buttonVariants } from '@/components/ui/button';
import { StartSetButton } from '@/components/drills/start-set-button';
import { CheckIn } from '@/components/drills/feedback';
import type { Checkin } from '@/lib/drills/feedback';
import type { homeView } from '@/lib/drills/program/home';
import { CASE_RESULTS_WIRED } from '@/lib/drills/case-result';
import { AppPage } from '@/components/brand/page';
import { Meter, StepDot } from '@/components/brand/progress';

const TRACK = { foundations: 'Foundations', standard: 'Standard', sprint: 'Sprint', self_directed: 'Practice on my own' } as const;
const SLOT = { review: 'Review', weak: 'Weak spot', unfamiliar: 'Something new' } as const;
const SOURCE = { case: 'your first full case', diagnostic: 'your diagnostic', questionnaire: 'your answers' } as const;
const STATE = { not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced', mastered: 'Mastered', validated: 'Validated' } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export type TrainingHomeData = Exclude<Awaited<ReturnType<typeof homeView>>, { kind: 'onboarding' }>;

// The training home's screen (docs/prd-drills.md "Training home", "What the
// home serves", "Practice on my own"); app/drills/page.tsx loads its data.
export function TrainingHome({ home, checkin }: { home: TrainingHomeData; checkin: Checkin | null }) {
  const checkinCard = checkin && <CheckIn id={checkin.id} kind={checkin.kind} />;

  const nav = (
    <nav className="t-small flex flex-wrap gap-x-5 gap-y-1 pt-1">
      {home.plan.source && <Link href="/drills/plan" className="link">Your plan</Link>}
      <Link href="/drills/browse" className="link">Browse drills</Link>
      <Link href="/drills/learn" className="link">Learn</Link>
      <Link href="/drills/progress" className="link">Your progress</Link>
      <Link href="/drills/settings" className="link">Settings</Link>
      <Link href="/home" className="link-quiet">Cases</Link>
    </nav>
  );
  const resume = home.resume && (
    <p className="t-small rounded-panel bg-sky/60 px-5 py-4">
      You have a {home.resume.drill_name} set in progress.{' '}
      <Link href={`/drills/sets/${home.resume.set_id}`} className="link">Resume it</Link>
    </p>
  );
  const d = home.diagnostic;
  const diagnosticCard = (lead: string) => (d.status === 'completed' ? null : (
    <section aria-labelledby="diag" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
      <h2 id="diag" className="t-heading font-semibold">{d.done > 0 ? `Diagnostic: part ${Math.min(d.done + 1, d.of)} of ${d.of}` : 'Find your starting point'}</h2>
      <p className="t-small">{d.done > 0 ? 'Pick up where you stopped. You have been placed from the parts you finished.' : lead}</p>
      <Link href="/drills/diagnostic" className={buttonVariants({ variant: d.done > 0 ? 'default' : 'outline' })}>{d.done > 0 ? 'Continue the diagnostic' : 'Start the diagnostic'}</Link>
    </section>
  ));
  const self = home.kind === 'self_directed';
  // No plan yet: three ways to get one (D6 round 2); the first one done makes it.
  // Two while a case result can't make a plan (CASE_RESULTS_WIRED).
  const getPlan = !home.plan.source && (
    <section aria-labelledby="get-plan" className="space-y-4">
      <h2 id="get-plan" className="t-heading font-semibold">{self ? 'Find your starting point' : 'Get your plan'}</h2>
      <p className="t-small">Pick one. {self ? 'Suggestions' : 'Your plan and first workout'} are ready as soon as you finish, and you can do the others later to sharpen {self ? 'them' : 'it'}.</p>
      <ul className={`grid gap-3 ${CASE_RESULTS_WIRED ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <li className="t-small flex flex-col justify-between gap-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet">
          <span><span className="t-body block font-semibold">Answer a few questions</span><span className="text-ink/70">2–3 minutes. The quickest start; your first workouts include short checks.</span></span>
          <Link href="/drills/questionnaire" className={buttonVariants({ size: 'sm' })}>Answer questions</Link>
        </li>
        <li className="t-small flex flex-col justify-between gap-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet">
          <span><span className="t-body block font-semibold">Take the diagnostic</span><span className="text-ink/70">About 15 minutes of short questions. More accurate.</span></span>
          <Link href="/drills/diagnostic" className={buttonVariants({ size: 'sm', variant: 'outline' })}>{d.done > 0 ? `Continue (part ${Math.min(d.done + 1, d.of)} of ${d.of})` : 'Start the diagnostic'}</Link>
        </li>
        {CASE_RESULTS_WIRED && (
          <li className="t-small flex flex-col justify-between gap-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet">
            <span><span className="t-body block font-semibold">Take a full case</span><span className="text-ink/70">About 35 minutes. The most accurate.</span></span>
            <Link href="/home" className={buttonVariants({ size: 'sm', variant: 'outline' })}>Go to cases</Link>
          </li>
        )}
      </ul>
    </section>
  );
  // A new plan the student hasn't opened yet.
  const planReady = home.plan.source && !home.plan.seen && (
    <section aria-labelledby="plan-ready" className="space-y-3 rounded-panel border border-cobalt/40 bg-white p-5 shadow-panel sm:p-6">
      <h2 id="plan-ready" className="t-heading font-semibold">{self ? 'Your starting point is ready' : 'Your plan is ready'}</h2>
      <p className="t-small">Built from {SOURCE[home.plan.source]}. {self ? 'See where you start and what to practice first.' : "See this week's focus, your schedule and your first workout."}</p>
      <Link href="/drills/plan" className={buttonVariants({ size: 'lg' })}>{self ? 'See your starting point' : 'See your plan'}</Link>
    </section>
  );
  const weakest = home.weakest && (
    <section aria-labelledby="weakest" className="space-y-1">
      <h2 id="weakest" className="t-heading font-semibold">Your weakest skill right now</h2>
      <p className="t-small">{home.weakest.skill_name}: {home.weakest.mistake}, {home.weakest.count}× recently.</p>
      {home.weakest.evidence && <p className="t-small text-ink/70">Last time you said: “{home.weakest.evidence}”</p>}
    </section>
  );

  if (home.kind === 'self_directed') {
    return (
      <AppPage width="reading" className="space-y-10">
        <header className="space-y-2">
          <h1 className="t-title">Practice on my own</h1>
          {nav}
        </header>
        {resume}
        {checkinCard}
        {getPlan}
        {planReady}
        {home.plan.source && d.status !== 'completed' && d.done > 0 && diagnosticCard('')}
        {home.summary && (
          <section aria-labelledby="summary" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
            <h2 id="summary" className="t-heading font-semibold">Your week</h2>
            <p className="t-small">{home.summary.sets} drill sets and {home.summary.cases} cases in the last 7 days.{home.summary.weakest && ` Weakest skill: ${home.summary.weakest}.`}</p>
            {home.summary.moved_up.length > 0 && <p className="t-small">Moved up: {home.summary.moved_up.map(m => `${m.skill_name} (${STATE[m.state]})`).join(', ')}.</p>}
          </section>
        )}
        {home.offer_sprint && (
          <p className="t-small rounded-panel border border-ink/12 bg-white p-4">Your interview is in {home.interview_days_out} days. A 7-day Sprint plan could help. <Link href="/drills/settings" className="link">Switch to Sprint</Link></p>
        )}
        {home.suggested && (
          <section aria-labelledby="suggested" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
            <h2 id="suggested" className="t-heading font-semibold">Suggested next</h2>
            <p className="t-small"><span className="font-semibold">{home.suggested.skill_name}</span> · {home.suggested.drill_name} · about {Math.max(1, home.suggested.minutes)} min</p>
            <p className="t-small text-ink/70">{home.suggested.reason}</p>
            <StartSetButton body={{ skill_id: home.suggested.skill_id, quick_start: true, placement_check: home.suggested.check || undefined, suggestion: { reason: home.suggested.reason, source: home.suggested.slot } }} label="Start" />
          </section>
        )}
        {home.weaknesses.length > 0 && (
          <section aria-labelledby="weak" className="space-y-2">
            <h2 id="weak" className="t-heading font-semibold">Your weaknesses</h2>
            <ol className="list-decimal space-y-1 pl-5 t-small">
              {home.weaknesses.map(w => <li key={w.tag}>{w.skill_name}: {w.label} ({w.count}×)</li>)}
            </ol>
          </section>
        )}
        <section aria-labelledby="progress" className="space-y-1">
          <h2 id="progress" className="t-heading font-semibold">Your progress</h2>
          <p className="t-small">{home.counts.practiced} skills at Practiced or above, {home.counts.mastered} Mastered.</p>
          {home.moved_up.length > 0 && <p className="t-small text-ink/70">This week: {home.moved_up.map(m => `${m.skill_name} → ${STATE[m.state]}`).join(', ')}.</p>}
        </section>
        {home.due.length > 0 && (
          <section aria-labelledby="due" className="space-y-2">
            <h2 id="due" className="t-heading font-semibold">Due now</h2>
            <ul className="space-y-2">
              {home.due.map(d => (
                <li key={d.skill_id} className="flex flex-wrap items-center justify-between gap-2 t-small rounded-panel border border-ink/12 bg-white p-4">
                  <span>{d.skill_name}: {d.what}</span>
                  <StartSetButton body={{ skill_id: d.skill_id, quick_start: true }} label="Start" size="sm" variant="outline" />
                </li>
              ))}
            </ul>
          </section>
        )}
        {weakest}
        <div className="flex flex-wrap gap-3">
          <Link href="/drills/browse" className={buttonVariants({ variant: 'outline' })}>Browse drills</Link>
          <Link href="/home" className={buttonVariants({ variant: 'ghost' })}>Browse cases</Link>
        </div>
      </AppPage>
    );
  }

  const { program, week_status: ws, workout } = home;
  const header = program.plan.kind === 'days'
    ? `Sprint · Day ${program.sprint_day_index} of ${program.plan.days.length}`
    : `${TRACK[program.track]} · Week ${program.week?.week ?? 0} of ${program.total_weeks} · ${program.week?.theme ?? ''}`;
  const next = workout?.blocks.findIndex(b => b.status !== 'done') ?? -1;
  const started = workout?.blocks.some(b => b.status !== 'todo');
  // A case finds weak spots only once its result reaches drills (CASE_RESULTS_WIRED).
  const emptyWorkoutLead = CASE_RESULTS_WIRED
    ? (d.status === 'completed' ? 'Take a case' : 'Take the diagnostic or a case')
    : (d.status === 'completed' ? 'Do a drill set' : 'Take the diagnostic');

  return (
    <AppPage width="reading" className="space-y-10">
      <header className="space-y-2">
        <h1 className="t-title">{header}</h1>
        {program.interview_date && <p className="t-small text-ink/70">Interview: {dateLabel(program.interview_date)} ({program.interview_days_out} days)</p>}
        {nav}
      </header>
      {resume}
      {checkinCard}

      {home.intro_first && (
        <section aria-labelledby="start-here" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="start-here" className="t-heading font-semibold">Start here: how a case interview works</h2>
          <p className="t-small">A short lesson on the four stages of a case, what interviewers look for in each, and the skills your plan trains for each one. Read it before your first workout.</p>
          <Link href="/drills/learn/intro?source=auto" className={buttonVariants({ size: 'lg' })}>Read it now</Link>
        </section>
      )}

      {getPlan}
      {planReady}
      {home.plan.source && d.status !== 'completed' && d.done > 0 && diagnosticCard('')}

      {workout && workout.blocks.length === 0 && (
        <section aria-labelledby="workout" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="workout" className="t-heading font-semibold">Today&apos;s workout</h2>
          <p className="t-small">Nothing to work on yet: we build workouts from your weak spots. {emptyWorkoutLead} so we can find them, or practice any skill in the meantime.</p>
          <div className="flex flex-wrap gap-3">
            {d.status !== 'completed' && <Link href="/drills/diagnostic" className={buttonVariants({ size: 'lg' })}>Take the diagnostic</Link>}
            <Link href="/drills/browse" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Browse drills</Link>
          </div>
        </section>
      )}

      {workout && workout.blocks.length > 0 && (
        <section aria-labelledby="workout" className="space-y-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="workout" className="t-heading font-semibold">Today&apos;s workout</h2>
            <span className="t-small text-ink/70">About {home.estimated_minutes} min · {workout.blocks.length} sets</span>
          </div>
          {/* The homepage loop's steps: a green check once a set is done, a Cobalt ring on the next. */}
          <ol className="space-y-4">
            {workout.blocks.map((b, i) => (
              <li key={i} className="t-small flex gap-3">
                <StepDot state={b.status === 'done' ? 'done' : i === next ? 'current' : 'todo'} className="mt-0.5" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span><span className="text-ink/70">{SLOT[b.slot]} · </span><span className="font-semibold">{getDrill(b.drill_id).name}</span>{b.kind === 'transfer' && ' (transfer check)'}</span>
                    <span className="text-ink/70 tabular-nums">{b.status === 'done' ? `Done${b.score !== null ? `, ${pct(b.score)}` : ''}` : b.status === 'grading' ? 'Grading…' : b.status === 'in_progress' ? 'In progress' : `${Math.max(1, Math.round(b.minutes))} min`}</span>
                  </p>
                  <p className="text-ink/70">{b.reason}</p>
                </div>
              </li>
            ))}
          </ol>
          {workout.status === 'completed' || next === -1
            ? <p className="t-small flex items-center gap-2 font-semibold"><StepDot state="done" />Workout done. Nice work.</p>
            : workout.blocks[next].status === 'todo'
              ? home.intro_first
                ? <Link href="/drills/learn/intro?source=auto" className={buttonVariants({ size: 'lg' })}>{started ? 'Continue workout' : "Start today's workout"}</Link>
                : home.lesson_first
                ? <Link href={`/drills/learn/${encodeURIComponent(workout.blocks[next].skill_id)}?source=auto&workout=${workout.id}&block=${next}`} className={buttonVariants({ size: 'lg' })}>{started ? 'Continue workout' : "Start today's workout"}</Link>
                : <StartSetButton body={{ workout_id: workout.id, block: next }} label={started ? 'Continue workout' : "Start today's workout"} size="lg" />
              : workout.blocks[next].set_id && <Link href={`/drills/sets/${workout.blocks[next].set_id}`} className={buttonVariants({ size: 'lg' })}>Continue workout</Link>}
        </section>
      )}

      {home.extra.length > 0 && (
        <section aria-labelledby="extra" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="extra" className="t-heading font-semibold">Want more today?</h2>
          <p className="t-small text-ink/70">An optional extra workout from your weak spots. It counts toward your skills, not toward this week&apos;s workout target.</p>
          <ul className="space-y-2">
            {home.extra.map((b, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 t-small">
                <span><span className="font-semibold">{getDrill(b.drill_id).name}</span> <span className="text-ink/70">· {b.reason} · {Math.max(1, Math.round(b.minutes))} min</span></span>
                <StartSetButton size="sm" variant="outline" label={`Start ${getDrill(b.drill_id).name}`}
                  body={b.check ? { skill_id: b.skill_id, quick_start: true, placement_check: true, browse: true } : { drill_id: b.drill_id, skill_id: b.skill_id, tier: b.tier, browse: true }} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {home.rediagnose && (
        <section aria-labelledby="rediagnose" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="rediagnose" className="t-heading font-semibold">Update your starting point?</h2>
          <p className="t-small">You&apos;ve switched to a plan. {home.rediagnose.last_days_ago === null ? "You haven't taken the diagnostic yet" : `Your last diagnostic was ${home.rediagnose.last_days_ago} days ago`}: a fresh one (about 15 minutes) updates where each skill you haven&apos;t practiced starts. Optional.</p>
          <Link href="/drills/diagnostic?retake=1" className={buttonVariants({ variant: 'outline' })}>Take the diagnostic</Link>
        </section>
      )}

      {ws && (
        <section aria-labelledby="week" className="space-y-2">
          <h2 id="week" className="t-heading font-semibold">This week</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Meter value={ws.workouts.target > 0 ? ws.workouts.done / ws.workouts.target : 0} label={`Workouts this week: ${ws.workouts.done} of ${ws.workouts.target}`} />
            <p className="t-small tabular-nums">{ws.workouts.done} of {ws.workouts.target} workouts, {ws.cases.done} of {ws.cases.target} cases.</p>
          </div>
          {ws.milestone_skills.length > 0 && (
            <ul className="flex flex-wrap gap-2 t-small">
              {ws.milestone_skills.map(s => <li key={s.id} className="rounded-full border border-ink/20 bg-white px-3 py-1">{s.name}: {STATE[s.state]}</li>)}
            </ul>
          )}
        </section>
      )}

      {home.next_case && (
        <section aria-labelledby="case" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="case" className="t-heading font-semibold">{home.next_case.retake ? 'Take the case again' : 'Next case'}</h2>
          <p className="t-small">{home.next_case.title}{home.next_case.retake && ': you have taken every case we have; another run shows what has changed.'}</p>
          <Link href={`/api/drills/next-case?case=${encodeURIComponent(home.next_case.case_id)}`} className={buttonVariants({ variant: 'outline' })}>Go to cases</Link>
        </section>
      )}

      {weakest}
    </AppPage>
  );
}
