import Link from 'next/link';
import { studentOrRedirect } from '@/lib/drills/session';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { diagnosticView } from '@/lib/drills/program/diagnostic-store';
import { activeProgram } from '@/lib/drills/program/store';
import { db } from '@/db/client';
import { buttonVariants } from '@/components/ui/button';
import { StartSetButton } from '@/components/drills/start-set-button';
import { RefreshWhileGrading, SkipDiagnosticButton } from '@/components/drills/diagnostic-actions';
import { healDiagnostic } from '@/lib/drills/grading/jobs';

const PLACE = {
  recognize: 'Starts with recognizing good answers',
  recognize_t2: 'Starts with recognizing good answers, at tier 2',
  repair: 'Starts with fixing flawed answers',
  test_out: 'Starts with building answers (test-out)',
} as const;
const STATUS = { todo: '', in_progress: 'In progress', grading: 'Grading…', done: 'Done' } as const;

// The diagnostic (docs/prd-drills.md "Onboarding and diagnostic"): about 15
// minutes, one flow of short parts, no feedback until the end, placement from
// whatever parts are finished.
export default async function DiagnosticPage() {
  const studentId = await studentOrRedirect();
  // A part whose set finished unrecorded is recorded now, finishing the diagnostic.
  await healDiagnostic(studentId);
  const [view, program] = await Promise.all([diagnosticView(studentId), activeProgram(db, studentId)]);
  const track = program?.track ?? null;
  const parts = DRILLS_CONFIG.programs.diagnostic.parts.length;
  const running = view && (view.status === 'in_progress' || (view.status === 'skipped' && view.done < parts));
  const nav = <nav className="text-sm"><Link href="/drills" className="text-muted-foreground underline-offset-4 hover:underline">← Training home</Link></nav>;

  // Not started yet.
  if (!view || (view.status === 'skipped' && view.done === 0)) {
    return (
      <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
        {nav}
        <header className="space-y-2">
          <h1 className="text-xl font-semibold">Find your starting point</h1>
          <p className="text-sm">A 15-minute check across structuring, hypotheses, math, charts, recommendations and next steps: {parts} short parts, one after another.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>No feedback until the end; answer and move on.</li>
            <li>You can stop at any time. We place you from the parts you finish, and you can pick up later.</li>
            <li>It sets where each skill starts. It never marks a skill as learned.</li>
          </ul>
        </header>
        <div className="flex flex-wrap gap-3">
          <StartSetButton body={{ diagnostic_part: 0 }} label="Start the diagnostic" size="lg" />
          <SkipDiagnosticButton label="I'll take a case first" />
        </div>
      </main>
    );
  }

  const next = view.next;
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 p-4 sm:p-6">
      {nav}
      {view.grading && <RefreshWhileGrading />}
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{view.status === 'completed' ? 'Your starting point' : 'Diagnostic'}</h1>
        <p className="text-sm text-muted-foreground">{view.done} of {parts} parts done{view.overall_score !== null ? ` · ${Math.round(view.overall_score * 100)}% ${view.status === 'completed' ? 'overall' : 'so far'}` : ''}</p>
      </header>

      {running && (
        <section aria-labelledby="parts" className="space-y-3">
          <h2 id="parts" className="sr-only">Parts</h2>
          <ol className="divide-y rounded-lg border text-sm">
            {view.parts.map(p => (
              <li key={p.index} className="flex items-center justify-between gap-3 p-3">
                <span><span className="text-muted-foreground">Part {p.index + 1} · </span>{p.drill_name}</span>
                <span className="text-muted-foreground">{STATUS[p.status] || `${p.size} item${p.size > 1 ? 's' : ''}`}</span>
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
          {!next && view.grading && <p className="text-sm">Grading your written answers… this takes a few seconds.</p>}
        </section>
      )}

      {view.placements.length > 0 && (
        <section aria-labelledby="placed" className="space-y-2">
          <h2 id="placed" className="font-medium">{view.status === 'completed' ? 'Where each skill starts' : 'Where you start so far'}</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {view.placements.map(p => (
              <li key={p.skill_id} className="flex flex-wrap items-baseline justify-between gap-2 p-3">
                <span className="font-medium">{p.skill_name}</span>
                <span className="text-muted-foreground">{PLACE[p.place]} · {Math.round(p.score * 100)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Skills not listed start where your plan begins them.</p>
        </section>
      )}

      {view.status === 'completed' && view.moved_to_track === 'foundations' && track === 'foundations' && (
        <p role="status" className="rounded-lg border p-4 text-sm">Based on your diagnostic, we&apos;ve started you on Foundations. You can switch to Standard anytime in <Link href="/drills/settings" className="underline underline-offset-4">settings</Link>.</p>
      )}

      {view.status === 'completed' && (
        <div className="flex flex-wrap gap-3">
          <Link href="/drills/plan" className={buttonVariants({ size: 'lg' })}>{track === 'self_directed' ? 'See your starting point' : 'See your plan'}</Link>
          <Link href="/drills" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Training home</Link>
        </div>
      )}
    </main>
  );
}
