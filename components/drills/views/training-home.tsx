import Link from 'next/link';
import { getDrill } from '@/lib/drills/config';
import { buttonVariants } from '@/components/ui/button';
import { StartSetButton } from '@/components/drills/start-set-button';
import { unfinishedLine } from '@/lib/drills/unfinished-text';
import { CheckIn } from '@/components/drills/feedback';
import type { Checkin } from '@/lib/drills/feedback';
import type { homeView } from '@/lib/drills/program/home';
import { caseResultsWired } from '@/lib/drills/case-to-drills';
import { BUILDING_PLAN, START_CHOICE } from '@/lib/drills/program/start-choice-text';
import { RefreshWhile } from '@/components/drills/refresh-while';
import { AppPage } from '@/components/brand/page';
import { StepDot } from '@/components/brand/progress';
import { ArrowLink } from '@/components/brand/links';
import { WeekCount } from '@/components/drills/week-count';
import { focusLine, lowerFirst, scoreLine, todaySections } from '@/lib/drills/today-page';
import { HowItWorks } from '@/components/drills/how-it-works';
import { KindTag } from '@/components/drills/kind-tag';

const TRACK = { foundations: 'Foundations', standard: 'Standard', sprint: 'Sprint', self_directed: 'Practice on my own' } as const;
const SLOT = { review: 'Review', weak: 'Weak spot', unfamiliar: 'Something new' } as const;
const SOURCE = { case: 'your first full case', diagnostic: 'your diagnostic', questionnaire: 'your answers' } as const;
const STATE = { not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced', mastered: 'Mastered', validated: 'Validated' } as const;
const dateLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export type TrainingHomeData = Exclude<Awaited<ReturnType<typeof homeView>>, { kind: 'onboarding' }>;

// The plan's place above the title, in the homepage's small slide-label style
// (as a lesson's is): the track and week, then the week's theme as the title
// (Matt, 13 Nov: the same words, on two lines).
function Title({ label, title }: { label: [string, string | null]; title: string }) {
  return (
    <>
      <p className="t-label text-ink/70"><span className="font-semibold text-ink">{label[0]}</span>{label[1] && ` · ${label[1]}`}</p>
      <h1 className="t-title text-balance">{title}</h1>
    </>
  );
}

// The training home's screen (docs/prd-drills.md "Training home", "What the
// home serves", "Practice on my own"); app/drills/page.tsx loads its data.
// Today in the app's bar, which also reaches every other area (Matt, 13 Nov).
// An interview in progress (Matt, 17 Nov, M3): its clock is running, so it leads the page while time is left.
export type UnfinishedInterview = { caseTitle: string; status: string; href: string };
export const INTERVIEW_IN_PROGRESS = 'Interview in progress';

// A card title's time ("2–3 min", "about 20 min") never breaks across lines.
function keepTimeTogether(title: string) {
  const m = /(about )?\d+(–\d+)? min/.exec(title);
  if (!m) return title;
  return <>{title.slice(0, m.index)}<span className="whitespace-nowrap">{m[0]}</span>{title.slice(m.index + m[0].length)}</>;
}

export function TrainingHome({ home, checkin, interview = null, caseEndedEarly = false }: { home: TrainingHomeData; checkin: Checkin | null; interview?: UnfinishedInterview | null; caseEndedEarly?: boolean }) {
  const interviewCard = interview && (
    <section aria-labelledby="interview" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-cobalt/40 bg-white p-5 shadow-panel sm:p-6">
      <div className="min-w-0 space-y-0.5">
        <h2 id="interview" className="t-label font-semibold text-ink/70">{INTERVIEW_IN_PROGRESS}</h2>
        <p className="t-card font-semibold">{interview.caseTitle}</p>
        <p className="t-small text-ink/70">{interview.status.replace(/^In progress · /, '')}</p>
      </div>
      <Link href={interview.href} className={buttonVariants()}>Continue</Link>
    </section>
  );
  const resume = home.resume && (
    <p className="t-small rounded-panel bg-sky/60 px-5 py-4">
      You have a {home.resume.drill_name} set in progress.{' '}
      <Link href={`/drills/sets/${home.resume.set_id}`} className="link">Resume it</Link>
    </p>
  );
  // Sets set aside for another drill (Matt, 21 Nov): "Unfinished: Mental math · 2 of 6 done · Resume".
  const unfinished = home.unfinished.length > 0 && (
    <ul aria-label="Unfinished sets" className="space-y-2">
      {home.unfinished.map(u => (
        <li key={u.set_id} className="t-small flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-panel bg-sky/60 px-5 py-3">
          <span className="tabular-nums">Unfinished: <KindTag kind="drill" /><span className="font-semibold">{unfinishedLine(u)}</span></span>
          <StartSetButton body={{ resume_set_id: u.set_id }} label="Resume" name={`Resume ${u.drill_name}`} size="sm" variant="outline" />
        </li>
      ))}
    </ul>
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
  // Two while a case result can't make a plan (CASE_TO_DRILLS=on).
  // No plan source yet (Matt, 22 Nov): three equal options — quick questions, the quick quiz, a case interview (Brew &
  // Bean; only while case results reach drills). On a phone they stack in that order. Text: start-choice-text.ts.
  const choice = home.start_choice;
  const card = (title: string, body: string, action: React.ReactNode, extra?: React.ReactNode) => (
    <li className="t-small flex flex-col justify-between gap-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet">
      <span className="space-y-1"><span className="t-body block font-semibold">{keepTimeTogether(title)}</span><span className="block text-ink/70">{body}</span>{extra}</span>
      {action}
    </li>
  );
  const getPlan = !home.plan.source && (
    <section aria-labelledby="get-plan" className="space-y-4">
      <h2 id="get-plan" className="t-heading font-semibold">{START_CHOICE.heading}</h2>
      {caseEndedEarly && <p className="t-small rounded-panel bg-sky/60 px-4 py-3">{START_CHOICE.endedEarly}</p>}
      <p className="t-small">{START_CHOICE.lead}</p>
      <ul className={`grid gap-3 ${choice?.case ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {card(START_CHOICE.questions.title, self ? START_CHOICE.selfQuestionsBody : START_CHOICE.questions.body,
          <Link href="/drills/questionnaire" className={buttonVariants({ size: 'sm', variant: 'outline' })}>{START_CHOICE.questions.button}</Link>)}
        {card(START_CHOICE.quiz.title, self ? START_CHOICE.selfQuizBody : START_CHOICE.quiz.body,
          <Link href="/drills/diagnostic" className={buttonVariants({ size: 'sm', variant: 'outline' })}>{d.done > 0 ? `Continue (part ${Math.min(d.done + 1, d.of)} of ${d.of})` : START_CHOICE.quiz.button}</Link>)}
        {choice?.case && card(START_CHOICE.case.title(choice.case.minutes), START_CHOICE.case.body,
          choice.case.blocked
            ? <span className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' pointer-events-none opacity-50'} aria-disabled="true" role="link">{START_CHOICE.case.button}</span>
            : <Link href={choice.case.href} className={buttonVariants({ size: 'sm', variant: 'outline' })}>{START_CHOICE.case.button}</Link>,
          choice.case.blocked
            ? <span role="status" className="block font-semibold text-ink">{choice.case.blocked}</span>
            : choice.case.uses && <span className="block text-ink/70">{choice.case.uses}</span>)}
      </ul>
    </section>
  );
  // A new plan the student hasn't opened yet.
  // A case just ended and its placements haven't arrived (Matt, 22 Nov): this instead of a default workout.
  const building = home.building_plan && (
    <section aria-labelledby="building-plan" className="space-y-2 rounded-panel bg-sky/60 p-5 sm:p-6">
      <h2 id="building-plan" className="t-heading font-semibold">Today&apos;s workout</h2>
      <p role="status" className="t-body">{BUILDING_PLAN}</p>
      <RefreshWhile />
    </section>
  );
  const planReady = !home.building_plan && home.plan.source && !home.plan.seen && (
    <section aria-labelledby="plan-ready" className="space-y-3 rounded-panel border border-cobalt/40 bg-white p-5 shadow-panel sm:p-6">
      <h2 id="plan-ready" className="t-heading font-semibold">{self ? 'Your starting point is ready' : 'Your plan is ready'}</h2>
      <p className="t-small">Built from {SOURCE[home.plan.source]}. {self ? 'See where you start and what to practice first.' : "See this week's focus, your schedule and your first workout."}</p>
      <Link href="/drills/plan" className={buttonVariants({ size: 'lg' })}>{self ? 'See your starting point' : 'See your plan'}</Link>
    </section>
  );
  // Quick fix (Matt, 13 Nov): the weakest skill with a short set to fix it,
  // the page's one optional extra. Left out when that skill is already the
  // next thing to practice (a workout set still to do, or Suggested next).
  const w = home.weakest;
  const quickFix = (already: boolean, H: 'h2' | 'h3' = 'h2') => w && !already && (
    <section aria-labelledby="quick-fix" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
      <H id="quick-fix" className="t-label font-semibold text-ink/70">Quick fix</H>
      {/* The top skill in the shared ranking, with its prescription's own reason (Matt, 15 Nov, D7). */}
      <p className="t-body font-semibold">{w.skill_name}</p>
      <p className="t-small text-ink/70">{w.reason}</p>
      {w.skill_id && w.practice_minutes !== null && (
        <StartSetButton body={{ skill_id: w.skill_id, quick_start: true }} label={`Practice ${lowerFirst(w.skill_name)} · ${w.practice_minutes} min`} variant="outline" />
      )}
    </section>
  );
  // The feedback question, folded to one line at the end of the page.
  const feedback = checkin && <CheckIn id={checkin.id} kind={checkin.kind} folded />;

  if (home.kind === 'self_directed') {
    return (
      <AppPage width="reading" className="space-y-10">
        <header className="space-y-2">
          <h1 className="t-title">Practice on my own</h1>
        </header>
        {/* Most urgent first (Matt, 13 Nov): unfinished work and first steps,
            then what to practice now, then optional, then how it's going. An
            interview's clock is running, so it comes before the explainer too. */}
        {interviewCard}
        {home.first_week && <HowItWorks />}
        {resume}
        {unfinished}
        {getPlan}
        {planReady}
        {home.plan.source && d.status !== 'completed' && d.done > 0 && diagnosticCard('')}
        {home.suggested && (
          <section aria-labelledby="suggested" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
            <h2 id="suggested" className="t-heading font-semibold">Suggested next</h2>
            <p className="t-small"><span className="font-semibold">{home.suggested.skill_name}</span> · <KindTag kind="drill" />{home.suggested.drill_name} · about {Math.max(1, home.suggested.minutes)} min</p>
            <p className="t-small text-ink/70">{home.suggested.reason}</p>
            <StartSetButton body={{ skill_id: home.suggested.skill_id, quick_start: true, placement_check: home.suggested.check || undefined, suggestion: { reason: home.suggested.reason, source: home.suggested.slot } }} label="Start" />
          </section>
        )}
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
        {home.offer_sprint && (
          <p className="t-small rounded-panel border border-ink/12 bg-white p-4">Your interview is in {home.interview_days_out} days. A 7-day Sprint plan could help. <Link href="/drills/settings" className="link">Switch to Sprint</Link></p>
        )}
        {quickFix(home.suggested?.skill_id === w?.skill_id)}
        {home.summary && (
          <section aria-labelledby="summary" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
            <h2 id="summary" className="t-heading font-semibold">Your week</h2>
            <p className="t-small">{home.summary.sets} drill sets and {home.summary.cases} cases in the last 7 days.{home.summary.weakest && ` Weakest skill: ${home.summary.weakest}.`}</p>
            {home.summary.moved_up.length > 0 && <p className="t-small">Moved up: {home.summary.moved_up.map(m => `${m.skill_name} (${STATE[m.state]})`).join(', ')}.</p>}
          </section>
        )}
        <section aria-labelledby="progress" className="space-y-1">
          <h2 id="progress" className="t-heading font-semibold">Your progress</h2>
          <p className="t-small">{home.counts.practiced} skills at Practiced or above, {home.counts.mastered} Mastered.</p>
          {home.moved_up.length > 0 && <p className="t-small text-ink/70">This week: {home.moved_up.map(m => `${m.skill_name} → ${STATE[m.state]}`).join(', ')}.</p>}
        </section>
        {home.weaknesses.length > 0 && (
          <section aria-labelledby="weak" className="space-y-2">
            <h2 id="weak" className="t-heading font-semibold">Your weaknesses</h2>
            <ol className="list-decimal space-y-1 pl-5 t-small">
              {home.weaknesses.map(w => <li key={w.tag}>{w.skill_name}: {w.label} ({w.count}×)</li>)}
            </ol>
          </section>
        )}
        {feedback}
      </AppPage>
    );
  }

  const { program, week_status: ws, workout } = home;
  const weekOf = `Week ${program.week?.week ?? 0} of ${program.total_weeks}`;
  const heading: { label: [string, string | null]; title: string } = program.plan.kind === 'days'
    ? { label: [`${TRACK.sprint} plan`, null], title: `Day ${program.sprint_day_index} of ${program.plan.days.length}` }
    : program.week?.theme
      ? { label: [`${TRACK[program.track]} plan`, weekOf], title: program.week.theme }
      : { label: [`${TRACK[program.track]} plan`, null], title: weekOf };
  const next = workout?.blocks.findIndex(b => b.status !== 'done') ?? -1;
  const started = workout?.blocks.some(b => b.status !== 'todo');
  // A case finds weak spots only once its result reaches drills (CASE_TO_DRILLS=on).
  const emptyWorkoutLead = caseResultsWired()
    ? (d.status === 'completed' ? 'Take a case' : 'Take the diagnostic or a case')
    : (d.status === 'completed' ? 'Do a drill set' : 'Take the diagnostic');

  // What to do now, then how it's going (Matt, 13 Nov): unfinished work and
  // first steps (a set in progress, the intro lesson until it's opened, the
  // plan, a diagnostic part left), today's workout with the one main button,
  // its extras once done, the quick fix, this week, the next case, a fresh
  // diagnostic, and the feedback question folded at the end.
  const planFirst = Boolean(getPlan || planReady);
  const workoutCard = workout && workout.blocks.length > 0 && (
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
                <span><span className="text-ink/70">{SLOT[b.slot]} · </span><KindTag kind="drill" /><span className="font-semibold">{getDrill(b.drill_id).name}</span>{b.kind === 'transfer' && ' (transfer check)'}</span>
                <span className="text-ink/70 tabular-nums">{b.status === 'done' ? (b.score !== null ? scoreLine(b.score, getDrill(b.drill_id).pass_bar) : 'Done') : b.status === 'grading' ? 'Grading…' : b.status === 'in_progress' ? 'In progress' : `${Math.max(1, Math.round(b.minutes))} min`}</span>
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
            // Outline: the intro card above it is the page's main button, and leads to the same lesson.
            ? <Link href="/drills/learn/intro?source=auto" className={buttonVariants({ size: 'lg', variant: 'outline' })}>{started ? 'Continue workout' : "Start today's workout"}</Link>
            : home.lesson_first
            ? <Link href={`/drills/learn/${encodeURIComponent(workout.blocks[next].skill_id)}?source=auto&workout=${workout.id}&block=${next}`} className={buttonVariants({ size: 'lg' })}>{started ? 'Continue workout' : "Start today's workout"}</Link>
            : <StartSetButton body={{ workout_id: workout.id, block: next }} label={started ? 'Continue workout' : "Start today's workout"} size="lg" />
          // Its set is in progress or set aside: the start resumes it (or asks, if another set is unfinished).
          : workout.blocks[next].set_id && <StartSetButton body={{ workout_id: workout.id, block: next }} label="Continue workout" size="lg" />}
    </section>
  );
  // Once the workout is finished (Matt, 13 Nov): a short done card, and the
  // rest under "Optional" (todaySections).
  const workoutDone = Boolean(workout && workout.blocks.length > 0 && (workout.status === 'completed' || next === -1));
  const doneCard = workout && workoutDone && (
    <section aria-labelledby="workout" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
      <h2 id="workout" className="t-heading flex items-center gap-2.5 font-semibold"><StepDot state="done" />You&apos;re done for today</h2>
      <ul className="t-small space-y-1.5">
        {workout.blocks.map((b, i) => (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span><KindTag kind="drill" /><span className="font-semibold">{getDrill(b.drill_id).name}</span></span>
            <span className="text-ink/70 tabular-nums">{b.score !== null ? scoreLine(b.score, getDrill(b.drill_id).pass_bar) : 'Done'}</span>
          </li>
        ))}
      </ul>
    </section>
  );
  const extraSets = (H: 'h2' | 'h3') => home.extra.length > 0 && (
    <section aria-labelledby="extra" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
      <H id="extra" className="t-heading font-semibold">Want more today?</H>
      <p className="t-small text-ink/70">An optional extra workout from your weak spots. It counts toward your skills, not toward this week&apos;s workout target.</p>
      <ul className="space-y-2">
        {home.extra.map((b, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 t-small">
            <span><KindTag kind="drill" /><span className="font-semibold">{getDrill(b.drill_id).name}</span> <span className="text-ink/70">· {b.reason} · {Math.max(1, Math.round(b.minutes))} min</span></span>
            <StartSetButton size="sm" variant="outline" label={`Start ${getDrill(b.drill_id).name}`}
              body={b.check ? { skill_id: b.skill_id, quick_start: true, placement_check: true, browse: true } : { drill_id: b.drill_id, skill_id: b.skill_id, tier: b.tier, browse: true }} />
          </li>
        ))}
      </ul>
    </section>
  );
  const fixShown = Boolean(w) && !workout?.blocks.some(b => b.status !== 'done' && b.skill_id === w?.skill_id);
  const layout = todaySections({ workoutDone, resume: Boolean(home.resume), quickFix: fixShown, extra: home.extra.length > 0 });
  const optional = layout.optional.length > 0 && (
    <section aria-labelledby="optional" className="space-y-4">
      <h2 id="optional" className="t-heading font-semibold">Optional</h2>
      {layout.optional.map(item => item === 'resume' && home.resume ? (
        <section key={item} aria-labelledby="resume-set" className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <div className="space-y-0.5">
            <h3 id="resume-set" className="t-card font-semibold"><KindTag kind="drill" />{home.resume.drill_name}</h3>
            <p className="t-small text-ink/70">In progress</p>
          </div>
          <Link href={`/drills/sets/${home.resume.set_id}`} className={buttonVariants({ variant: 'outline' })}>Resume</Link>
        </section>
      ) : item === 'quick_fix' ? <div key={item}>{quickFix(false, 'h3')}</div>
        : item === 'extra' ? <div key={item}>{extraSets('h3')}</div> : null)}
    </section>
  );

  return (
    <AppPage width="reading" className="space-y-10">
      <header className="space-y-2">
        <Title {...heading} />
        {program.interview_date && <p className="t-small text-ink/70">Interview: {dateLabel(program.interview_date)} ({program.interview_days_out} days)</p>}
      </header>
      {interviewCard}
      {home.first_week && <HowItWorks />}
      {layout.resumeTop && resume}
      {unfinished}
      {home.intro_first && (
        <section aria-labelledby="start-here" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="start-here" className="t-heading font-semibold"><KindTag kind="lesson" />Start here: how a case interview works</h2>
          <p className="t-small">A short lesson on the four stages of a case, what interviewers look for in each, and the skills your plan trains for each one. Read it before your first workout.</p>
          <Link href="/drills/learn/intro?source=auto" className={buttonVariants({ size: 'lg' })}>Read it now</Link>
        </section>
      )}
      {getPlan}
      {building}
      {planReady}
      {home.plan.source && d.status !== 'completed' && d.done > 0 && diagnosticCard('')}
      {!planFirst && workout && workout.blocks.length === 0 && (
        <section aria-labelledby="workout" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="workout" className="t-heading font-semibold">Today&apos;s workout</h2>
          <p className="t-small">Nothing to work on yet: we build workouts from your weak spots. {emptyWorkoutLead} so we can find them, or practice any skill in the meantime.</p>
          <div className="flex flex-wrap gap-3">
            {d.status !== 'completed' && <Link href="/drills/diagnostic" className={buttonVariants({ size: 'lg' })}>Take the diagnostic</Link>}
            <Link href="/drills/browse" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Browse drills</Link>
          </div>
        </section>
      )}
      {!planFirst && (workoutDone ? doneCard : workoutCard)}
      {workoutDone ? optional : !home.building_plan && quickFix(!fixShown)}
      {ws && (ws.workouts.target > 0 || ws.cases.target > 0 || ws.milestone_skills.length > 0) && (
        <section aria-labelledby="week" className="space-y-3">
          <h2 id="week" className="t-heading font-semibold">This week</h2>
          {/* Each count on its own (Matt, 13 Nov): a small bar until it's met, then a green check. */}
          <ul className="t-small flex flex-wrap gap-x-10 gap-y-2">
            {ws.workouts.target > 0 && <WeekCount name="Workouts" done={ws.workouts.done} target={ws.workouts.target} />}
            {ws.cases.target > 0 && <WeekCount name="Cases" done={ws.cases.done} target={ws.cases.target} />}
          </ul>
          {ws.milestone_skills.length > 0 && (
            <p className="t-small flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span>{focusLine(ws.milestone_skills.map(m => m.state))}</span>
              <ArrowLink href="/drills/progress">See all in Progress</ArrowLink>
            </p>
          )}
        </section>
      )}
      {home.next_case && (
        <section aria-labelledby="case" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="case" className="t-heading font-semibold">Next case</h2>
          {/* Never a retake by default (Matt, 15 Nov): with every case taken, the student chooses one. */}
          <p className="t-small">{home.next_case.case_id ? home.next_case.title : 'You’ve taken every case. Retake one?'}</p>
          <Link href={home.next_case.case_id ? `/api/drills/next-case?case=${encodeURIComponent(home.next_case.case_id)}` : '/home#cases'} className={buttonVariants({ variant: 'outline' })}>Go to cases</Link>
        </section>
      )}
      {home.rediagnose && (
        <section aria-labelledby="rediagnose" className="space-y-3 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <h2 id="rediagnose" className="t-heading font-semibold">Update your starting point?</h2>
          <p className="t-small">You&apos;ve switched to a plan. {home.rediagnose.last_days_ago === null ? "You haven't taken the diagnostic yet" : `Your last diagnostic was ${home.rediagnose.last_days_ago} days ago`}: a fresh one (about 15 minutes) updates where each skill you haven&apos;t practiced starts. Optional.</p>
          <Link href="/drills/diagnostic?retake=1" className={buttonVariants({ variant: 'outline' })}>Take the diagnostic</Link>
        </section>
      )}
      {feedback}
    </AppPage>
  );
}
