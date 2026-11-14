import Link from 'next/link';
import { AppPage } from '@/components/brand/page';
import { ProgressLine, StepDot } from '@/components/brand/progress';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import type { diagnosticView } from '@/lib/drills/program/diagnostic-store';
import type { ProgramRow } from '@/lib/drills/program/store';
import { buttonVariants } from '@/components/ui/button';
import { StartSetButton } from '@/components/drills/start-set-button';
import { RefreshWhileGrading, SkipDiagnosticButton } from '@/components/drills/diagnostic-actions';

const PLACE = {
  recognize: 'Starts with recognizing good answers',
  recognize_t2: 'Starts with recognizing good answers, at Level 2',
  repair: 'Starts with fixing flawed answers',
  test_out: 'Starts with building answers (test-out)',
} as const;
const STATUS = { todo: '', in_progress: 'In progress', grading: 'Grading…', done: 'Done' } as const;

export type DiagnosticData = Awaited<ReturnType<typeof diagnosticView>>;

// The diagnostic's screen; app/drills/diagnostic/page.tsx loads its data.
export function DiagnosticScreen({ view, track, retake }: { view: DiagnosticData; track: ProgramRow['track'] | null; retake: boolean }) {
  const parts = DRILLS_CONFIG.programs.diagnostic.parts.length;
  const running = view && (view.status === 'in_progress' || (view.status === 'skipped' && view.done < parts));

  if (!view || (view.status === 'skipped' && view.done === 0) || retake) {
    return (
      <AppPage width="narrow" className="space-y-8">
        <header className="space-y-3">
          <h1 className="t-title">{retake ? 'Take the diagnostic again' : 'Find your starting point'}</h1>
          <p className="t-small">A 15-minute check across structuring, hypotheses, math, charts, recommendations and next steps: {parts} short parts, one after another.</p>
          <ul className="list-disc space-y-1 pl-5 t-small text-ink/70">
            <li>No feedback until the end; answer and move on.</li>
            <li>You can stop at any time. We place you from the parts you finish, and you can pick up later.</li>
            <li>It sets where each skill starts. It never marks a skill as learned.</li>
          </ul>
        </header>
        <div className="flex flex-wrap gap-3">
          <StartSetButton body={{ diagnostic_part: 0 }} label="Start the diagnostic" size="lg" />
          <SkipDiagnosticButton label="I'll take a case first" />
        </div>
      </AppPage>
    );
  }

  const next = view.next;
  return (
    <AppPage width="narrow" className="space-y-8">
      {view.grading && <RefreshWhileGrading />}
      <header className="space-y-3">
        <h1 className="t-title">{view.status === 'completed' ? 'Your starting point' : 'Diagnostic'}</h1>
        <ProgressLine value={view.done} max={parts} />
        <p className="t-small text-ink/70">{view.done} of {parts} parts done{view.overall_score !== null ? ` · ${Math.round(view.overall_score * 100)}% ${view.status === 'completed' ? 'overall' : 'so far'}` : ''}</p>
      </header>

      {running && (
        <section aria-labelledby="parts" className="space-y-3">
          <h2 id="parts" className="sr-only">Parts</h2>
          <ol className="t-small divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {view.parts.map(p => (
              <li key={p.index} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex items-center gap-3"><StepDot state={p.status === 'done' ? 'done' : p.index === next?.index ? 'current' : 'todo'} /><span><span className="text-ink/70">Part {p.index + 1} · </span><span className="font-semibold">{p.drill_name}</span></span></span>
                <span className="text-ink/70">{STATUS[p.status] || `${p.size} item${p.size > 1 ? 's' : ''}`}</span>
              </li>
            ))}
          </ol>
          {next && (
            <div className="flex flex-wrap gap-3">
              {next.status === 'in_progress' && next.set_id
                ? <Link href={`/drills/sets/${next.set_id}`} className={buttonVariants({ size: 'lg' })}>Continue part {next.index + 1} of {parts}</Link>
                : <StartSetButton body={{ diagnostic_part: next.index }} label={`Start part ${next.index + 1} of ${parts}`} size="lg" />}
              <SkipDiagnosticButton label="Stop for now" />
            </div>
          )}
          {!next && view.grading && <p className="t-small">Grading your written answers… this takes a few seconds.</p>}
        </section>
      )}

      {view.placements.length > 0 && (
        <section aria-labelledby="placed" className="space-y-2">
          <h2 id="placed" className="t-heading font-semibold">{view.status === 'completed' ? 'Where each skill starts' : 'Where you start so far'}</h2>
          <ul className="t-small divide-y divide-ink/10 overflow-hidden rounded-panel border border-ink/12 bg-white shadow-quiet">
            {view.placements.map(p => (
              <li key={p.skill_id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className="font-semibold">{p.skill_name}</span>
                <span className="text-ink/70">{PLACE[p.place]} · {Math.round(p.score * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="t-small text-ink/70">Skills not listed start where your plan begins them.</p>
        </section>
      )}

      {view.status === 'completed' && view.moved_to_track === 'foundations' && track === 'foundations' && (
        <p role="status" className="t-small rounded-panel bg-sky/60 px-5 py-4">Based on your diagnostic, we&apos;ve started you on Foundations. You can switch to Standard anytime in <Link href="/drills/settings" className="link">settings</Link>.</p>
      )}

      {view.status === 'completed' && (
        <div className="flex flex-wrap gap-3">
          <Link href="/drills/plan" className={buttonVariants({ size: 'lg' })}>{track === 'self_directed' ? 'See your starting point' : 'See your plan'}</Link>
          <Link href="/drills" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Training home</Link>
        </div>
      )}
    </AppPage>
  );
}
