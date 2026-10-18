'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { AvailabilityOption } from '@/components/drills/onboarding-form';

// The 2–3 minute questionnaire (docs/prd-drills.md "Getting a plan"): the
// onboarding answers, prefilled and editable, plus a 1–5 self-rating for four
// areas and the one the student finds hardest. Submitting makes the plan.
const AREAS = [
  { id: 'structuring', label: 'Structuring a case', hint: 'Breaking a problem into clear, non-overlapping parts' },
  { id: 'math', label: 'Math', hint: 'Percentages, growth, market sizing, mental math' },
  { id: 'charts', label: 'Charts and exhibits', hint: 'Reading a chart or table and finding what matters' },
  { id: 'recommendations', label: 'Recommendations', hint: 'Giving an answer first, backed by evidence, and the next step' },
] as const;
type Area = (typeof AREAS)[number]['id'];

export function QuestionnaireForm({ availability, today, initial, showHours }: {
  availability: AvailabilityOption[]; today: string; showHours: boolean;
  initial: { interview_date: string | null; cases_done: '0' | '1-5' | '6+' | null; availability: string };
}) {
  const router = useRouter();
  const [interviewDate, setInterviewDate] = useState(initial.interview_date ?? '');
  const [casesDone, setCasesDone] = useState<'0' | '1-5' | '6+' | ''>(initial.cases_done ?? '');
  const [hours, setHours] = useState(initial.availability);
  const [ratings, setRatings] = useState<Partial<Record<Area, number>>>({});
  const [hardest, setHardest] = useState<Area | 'not_sure' | ''>('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!casesDone) { setError('Tell us how many practice cases you have done.'); return; }
    const missing = AREAS.filter(a => !ratings[a.id]);
    if (missing.length) { setError(`Rate yourself on ${missing.map(a => a.label.toLowerCase()).join(', ')}.`); return; }
    setBusy(true);
    setError('');
    const res = await fetch('/api/drills/questionnaire', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interview_date: interviewDate || null, cases_done: casesDone, availability: showHours ? hours : undefined,
        ratings, hardest: hardest === 'not_sure' || hardest === '' ? null : hardest,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.message ?? 'Something went wrong. Please try again.'); return; }
    router.push('/drills/plan');
  }

  const box = 'flex items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-foreground';
  const pill = 'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-foreground';
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="interview" className="block font-medium">When is your interview? <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="interview" type="date" min={today} value={interviewDate} onChange={e => setInterviewDate(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:w-auto" />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">How many practice cases have you done?</legend>
        <div className="flex flex-wrap gap-2">
          {(['0', '1-5', '6+'] as const).map(v => (
            <label key={v} className={pill}>
              <input type="radio" name="cases" checked={casesDone === v} onChange={() => setCasesDone(v)} />
              {v === '1-5' ? '1–5' : v}
            </label>
          ))}
        </div>
      </fieldset>

      {showHours && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">How much time do you have each week?</legend>
          {availability.map(a => (
            <label key={a.id} className={box}>
              <input type="radio" name="hours" checked={hours === a.id} onChange={() => setHours(a.id)} className="mt-1" />
              <span>{a.label} <span className="text-muted-foreground">({a.workouts_per_week} workouts a week, plus cases)</span></span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="space-y-4">
        <div>
          <p className="font-medium">How confident are you in each?</p>
          <p className="text-sm text-muted-foreground">1 means new to it, 5 means confident. A rough guess is fine.</p>
        </div>
        {AREAS.map(a => (
          <fieldset key={a.id} className="space-y-2">
            <legend className="text-sm"><span className="font-medium">{a.label}</span> <span className="text-muted-foreground">· {a.hint}</span></legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <label key={n} className={pill}>
                  <input type="radio" name={`rate-${a.id}`} checked={ratings[a.id] === n} onChange={() => setRatings(r => ({ ...r, [a.id]: n }))}
                    aria-label={`${n}${n === 1 ? ', new to it' : n === 5 ? ', confident' : ''}`} />
                  <span aria-hidden="true">{n}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">What do you find hardest? <span className="font-normal text-muted-foreground">(optional)</span></legend>
        <div className="flex flex-wrap gap-2">
          {[...AREAS.map(a => ({ id: a.id, label: a.label })), { id: 'not_sure' as const, label: 'Not sure' }].map(o => (
            <label key={o.id} className={pill}>
              <input type="radio" name="hardest" checked={hardest === o.id} onChange={() => setHardest(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? 'Building your plan…' : 'Build my plan'}</Button>
    </form>
  );
}
