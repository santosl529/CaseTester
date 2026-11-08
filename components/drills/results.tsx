import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DrillChart } from '@/components/drills/chart';
import { ItemFeedbackPanel } from '@/components/drills/runner';
import { RetryButton } from '@/components/drills/retry-button';
import { LessonBody } from '@/components/drills/lesson';
import { LessonViewLog } from '@/components/drills/lesson-actions';
import { CheckIn, ReportProblem } from '@/components/drills/feedback';
import type { Checkin } from '@/lib/drills/feedback';
import type { setResults } from '@/lib/drills/sets/service';

type Results = Extract<Awaited<ReturnType<typeof setResults>>, { status: 'completed' }>;

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;
const STATE_LABEL = {
  not_started: 'not started', learning: 'learning', recognizes: 'Recognizes', practiced: 'Practiced',
  mastered: 'Mastered', validated: 'Validated',
} as const;

// Set results (docs/prd-drills.md "Set results screen"): score against the
// bar, time against target, the mistake summary, the per-item breakdown and
// next actions, and any skill state change. Workouts arrive in D4.
export function SetResults({ results, checkin }: { results: Results; checkin?: Checkin | null }) {
  const tierMoved = results.tier.after !== results.tier.before;
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <h1 className="t-title">{results.drill.name}: {results.score === null ? 'grading delayed' : `${Math.round(results.score * 100)}%`}</h1>
        {results.ungraded > 0 && (
          <p className="t-small">
            {results.score === null
              ? 'We couldn\'t grade your written answers this time, so this set doesn\'t count toward your progress.'
              : `We couldn't grade ${results.ungraded === 1 ? 'one of your answers' : `${results.ungraded} of your answers`}, so ${results.ungraded === 1 ? 'it doesn\'t' : 'they don\'t'} count toward your score or progress.`}
            {' '}You can still compare with the strong answer below, or report a problem.
          </p>
        )}
        <p className="t-small">
          {results.score !== null && <>
            {/* Green is for completion: a pass. Not yet passing is not an error. */}
            <Badge variant={results.passed ? 'strong' : 'outline'} className="mr-1 align-[1px]">{results.passed ? 'Passed' : 'Not passed yet'}</Badge>
            {' '}— the bar is {Math.round(results.pass_bar * 100)}%.
          </>}
          {results.untimed
            ? <>{' '}Time: {seconds(results.time_ms)}, untimed (the timed target is {seconds(results.target_ms)}).</>
            : <>{' '}Time: {seconds(results.time_ms)} of a {seconds(results.target_ms)} target.</>}
        </p>
        {results.mistakes && <p className="t-small">{results.mistakes.text}</p>}
        {results.lesson_skill && (
          <p className="t-small">A tough set. <Link href={`/drills/learn/${encodeURIComponent(results.lesson_skill.id)}?source=low_score`} className="link">Read the short lesson on {results.lesson_skill.name}</Link> before the next one.</p>
        )}
        {results.skill_changes.map(c => (
          <p key={`${c.skill_id}-${c.to}`} className="t-small font-semibold">
            <Link href={`/drills/progress/${encodeURIComponent(c.skill_id)}?from=results`} className="link">{c.skill_name}</Link>: now {STATE_LABEL[c.to]}.
            {c.transfer_due_at && ` Transfer check unlocks ${new Date(c.transfer_due_at).toLocaleDateString('en-US', { weekday: 'long' })}.`}
          </p>
        ))}
        {tierMoved && (
          <p className="t-small text-ink/70">
            Next set: tier {results.tier.after} ({results.tier.after > results.tier.before ? 'harder items, less time' : 'easier items, more time'}).
          </p>
        )}
      </header>

      {results.defend_lesson && (
        <section aria-label="Defending your answer" className="space-y-4 rounded-panel border border-ink/12 bg-white p-5 shadow-quiet sm:p-6">
          <p className="t-small font-semibold">You just answered your first follow-up. Here is how to defend an answer, and what the follow-up checks.</p>
          <LessonBody lesson={results.defend_lesson} mode="summary" embedded />
          <LessonViewLog lessonId={results.defend_lesson.lesson_id} version={results.defend_lesson.version} source="follow_up" />
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/drills" className={buttonVariants({ size: 'lg' })}>{results.from_workout ? 'Continue workout' : 'Back to training'}</Link>
        <RetryButton drillId={results.drill.id} skillId={results.focus_skill} />
        <Link href="/home" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>Take a case</Link>
        <Link href="/drills/progress" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>Your progress</Link>
      </div>

      {checkin && <CheckIn id={checkin.id} kind={checkin.kind} />}

      <section aria-labelledby="breakdown" className="space-y-4">
        <h2 id="breakdown" className="t-heading font-semibold">Item by item</h2>
        {/* Items divided by rules, so the feedback panel is the one card in each. */}
        <ol className="divide-y divide-ink/12 border-t border-ink/12">
          {results.items.map(item => (
            <li key={item.position} className="space-y-4 py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
  <p className="t-small font-semibold">Item {item.position + 1} <span className="font-normal text-ink/70">· {results.untimed
                ? `${seconds(item.time_ms)} (timed target ${seconds(item.time_limit_ms)})`
                : `${seconds(Math.min(item.time_ms, item.time_limit_ms))} of ${seconds(item.time_limit_ms)}`}</span></p>
                <ReportProblem setId={results.set_id} position={item.position} screen="results" />
              </div>
              <p className="t-body whitespace-pre-line font-medium">{item.prompt}</p>
              {item.exhibit && <DrillChart spec={item.exhibit} exhibit />}
              <ItemFeedbackPanel feedback={item.feedback} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
