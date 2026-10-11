import Link from 'next/link';
import { studentOrRedirect } from '@/lib/drills/session';
import { skillProfile } from '@/lib/drills/progress/profile';
import { PrescriptionActions } from '@/components/drills/prescription-actions';
import { RUBRIC_DIMENSION_LABELS, ratingLabel, type RubricDimensionKey } from '@/lib/scoring/rubric';

const STATE_LABEL = {
  not_started: 'Not started', learning: 'Learning', recognizes: 'Recognizes', practiced: 'Practiced',
  mastered: 'Mastered', validated: 'Validated',
} as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

// The skill profile (docs/prd-drills.md "Skill profile"): every skill's state
// and progress toward the next one, what it builds on, open prescriptions,
// the top mistakes of the last 30 days, rubric trends and history.
export default async function SkillProfilePage() {
  const studentId = await studentOrRedirect();
  const profile = await skillProfile(studentId);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Your skills</h1>
        <Link href="/drills" className="text-sm text-muted-foreground underline-offset-4 hover:underline">All drills</Link>
      </header>

      <section aria-labelledby="rx" className="space-y-3">
        <h2 id="rx" className="font-medium">Prescribed for you</h2>
        {profile.prescriptions.length === 0
          ? <p className="text-sm text-muted-foreground">Nothing yet. Take a case and your prescriptions appear here.</p>
          : (
            <ul className="space-y-3">
              {profile.prescriptions.map(rx => (
                <li key={rx.id} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">{rx.skill_name} · {rx.drill_name}{rx.status === 'paused' && ' (paused while you practice what it builds on)'}</p>
                  <p className="text-sm text-muted-foreground">{rx.reason}</p>
                  <PrescriptionActions id={rx.id} paused={rx.status === 'paused'} />
                </li>
              ))}
            </ul>
          )}
      </section>

      {profile.top_mistakes.length > 0 && (
        <section aria-labelledby="mistakes" className="space-y-2">
          <h2 id="mistakes" className="font-medium">What&apos;s holding you back (last 30 days)</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {profile.top_mistakes.map(m => <li key={m.tag}>{m.label} ({m.skill_name}): {m.count}×</li>)}
          </ol>
        </section>
      )}

      <section aria-labelledby="skills" className="space-y-4">
        <h2 id="skills" className="font-medium">Skills</h2>
        {profile.areas.map(area => (
          <div key={area.code} className="space-y-2">
            <h3 className="text-sm font-semibold">{area.name}</h3>
            <ul className="divide-y rounded-lg border">
              {area.skills.map(s => (
                <li key={s.id} className="space-y-1 p-3 text-sm">
                  <p className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{s.name}</span>
                    <span>{s.live ? STATE_LABEL[s.state] : 'Coming soon'}</span>
                  </p>
                  {s.live && (s.state === 'learning' || s.state === 'recognizes') && (
                    <p className="text-muted-foreground">
                      {s.progress.passing_sets} of {s.progress.of} passing sets.
                      {s.progress.last_score !== null && ` Last score: ${pct(s.progress.last_score)}. Need ${pct(s.progress.bar)}.`}
                    </p>
                  )}
                  {s.transfer_due_at && <p className="text-muted-foreground">Transfer check unlocks {day(s.transfer_due_at)}.</p>}
                  {s.next_review_at && <p className="text-muted-foreground">Next review from {day(s.next_review_at)}.</p>}
                  {s.paused_for && <p className="text-muted-foreground">Paused: practicing {s.paused_for} first.</p>}
                  {s.builds_on.length > 0 && (
                    <p className="text-muted-foreground">Builds on: {s.builds_on.map(b => `${b.name} (${STATE_LABEL[b.state]})`).join(', ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {profile.rubric_trends.length > 0 && (
        <section aria-labelledby="trends" className="space-y-2">
          <h2 id="trends" className="font-medium">Case rubric trend</h2>
          {profile.rubric_trends.map(t => (
            <div key={t.tier} className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="text-left text-muted-foreground">Tier {t.tier} cases</caption>
                <thead><tr><th className="text-left font-medium">Dimension</th>{t.cases.map((c, i) => <th key={i} className="text-left font-medium">{c.completed_at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</th>)}</tr></thead>
                <tbody>
                  {[...new Set(t.cases.flatMap(c => Object.keys(c.ratings)))].map(dim => (
                    <tr key={dim}><td>{RUBRIC_DIMENSION_LABELS[dim as RubricDimensionKey] ?? dim}</td>{t.cases.map((c, i) => <td key={i}>{c.ratings[dim] ? ratingLabel(c.ratings[dim]) : '—'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {profile.history.length > 0 && (
        <section aria-labelledby="history" className="space-y-2">
          <h2 id="history" className="font-medium">History</h2>
          <ul className="space-y-1 text-sm">
            {profile.history.map((h, i) => (
              <li key={i}>
                {h.at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: {h.kind === 'case' ? `Case ${h.title}` : `${h.title}${h.transfer ? ' (transfer check)' : ''}`}
                {h.score !== null && `, ${pct(h.score)}`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
