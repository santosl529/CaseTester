import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { DrillChart } from '@/components/drills/chart';
import { ItemFeedbackPanel } from '@/components/drills/runner';
import { RetryButton } from '@/components/drills/retry-button';
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
export function SetResults({ results }: { results: Results }) {
  const pct = Math.round(results.score * 100);
  const tierMoved = results.tier.after !== results.tier.before;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{results.drill.name}: {pct}%</h1>
        <p className="text-sm">
          <span className={results.passed ? 'font-medium' : 'font-medium text-destructive'}>{results.passed ? 'Passed' : 'Not passed yet'}</span>
          {' '}— the bar is {Math.round(results.pass_bar * 100)}%.
          {' '}Time: {seconds(results.time_ms)} of a {seconds(results.target_ms)} target.
        </p>
        {results.mistakes && <p className="text-sm">{results.mistakes.text}</p>}
        {results.lesson_skill && (
          <p className="text-sm">A tough set. <Link href={`/drills/learn/${encodeURIComponent(results.lesson_skill.id)}?source=low_score`} className="font-medium underline underline-offset-4">Read the 3-minute lesson on {results.lesson_skill.name.toLowerCase()}</Link> before the next one.</p>
        )}
        {results.skill_changes.map(c => (
          <p key={`${c.skill_id}-${c.to}`} className="text-sm font-medium">
            {c.skill_name}: now {STATE_LABEL[c.to]}.
            {c.transfer_due_at && ` Transfer check unlocks ${new Date(c.transfer_due_at).toLocaleDateString('en-US', { weekday: 'long' })}.`}
          </p>
        ))}
        {tierMoved && (
          <p className="text-sm text-muted-foreground">
            Next set: tier {results.tier.after} ({results.tier.after > results.tier.before ? 'harder items, less time' : 'easier items, more time'}).
          </p>
        )}
      </header>

      <div className="flex flex-wrap gap-3">
        <Link href="/drills" className={buttonVariants({ size: 'lg' })}>{results.from_workout ? 'Continue workout' : 'Back to training'}</Link>
        <RetryButton drillId={results.drill.id} skillId={results.focus_skill} />
        <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>Take a case</Link>
        <Link href="/drills/profile" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>Your skills</Link>
      </div>

      <section aria-labelledby="breakdown" className="space-y-4">
        <h2 id="breakdown" className="text-base font-medium">Item by item</h2>
        <ol className="space-y-4">
          {results.items.map(item => (
            <li key={item.position} className="space-y-3 rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Item {item.position + 1} · {seconds(Math.min(item.time_ms, item.time_limit_ms))} of {seconds(item.time_limit_ms)}</p>
              <p className="whitespace-pre-line text-sm font-medium">{item.prompt}</p>
              {item.exhibit && <DrillChart spec={item.exhibit} />}
              <ItemFeedbackPanel feedback={item.feedback} />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
