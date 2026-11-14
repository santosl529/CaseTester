'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { AvailabilityOption } from '@/components/drills/onboarding-form';
import { drillFetch } from '@/lib/drills/client-fetch';

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
    const res = await drillFetch('/api/drills/questionnaire', {
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

  const box = 'flex cursor-pointer items-start gap-3 rounded-window border border-ink/15 bg-white p-4 t-small transition-colors hover:border-ink/35 has-[:checked]:border-cobalt has-[:checked]:bg-sky/40 motion-reduce:transition-none [&_input]:accent-cobalt';
  const pill = 'flex cursor-pointer items-center gap-2 rounded-full border border-ink/20 bg-white px-4 py-2 t-small transition-colors hover:border-ink/40 has-[:checked]:border-cobalt has-[:checked]:bg-sky/40 motion-reduce:transition-none [&_input]:accent-cobalt';
  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="interview" className="t-small block font-semibold">When is your interview? <span className="font-normal text-ink/70">(optional)</span></label>
        <input id="interview" type="date" min={today} value={interviewDate} onChange={e => setInterviewDate(e.target.value)}
          className="h-10 w-full rounded-field border border-ink/20 bg-white px-3 t-small text-ink transition-colors hover:border-ink/35 focus-visible:border-cobalt motion-reduce:transition-none sm:w-auto" />
      </div>

      <fieldset className="space-y-2">
        <legend className="t-small mb-2 font-semibold">How many practice cases have you done?</legend>
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
          <legend className="t-small mb-2 font-semibold">How much time do you have each week?</legend>
          {availability.map(a => (
            <label key={a.id} className={box}>
              <input type="radio" name="hours" checked={hours === a.id} onChange={() => setHours(a.id)} className="mt-1" />
              <span>{a.label} <span className="text-ink/70">({a.workouts_per_week} workouts a week, plus cases)</span></span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="space-y-4">
        <div>
          <p className="t-small font-semibold">How confident are you in each?</p>
          <p className="t-small text-ink/70">1 means new to it, 5 means confident. A rough guess is fine.</p>
        </div>
        {AREAS.map(a => (
          <fieldset key={a.id} className="space-y-2">
            <legend className="t-small"><span className="font-semibold">{a.label}</span> <span className="text-ink/70">· {a.hint}</span></legend>
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
        <legend className="t-small mb-2 font-semibold">What do you find hardest? <span className="font-normal text-ink/70">(optional)</span></legend>
        <div className="flex flex-wrap gap-2">
          {[...AREAS.map(a => ({ id: a.id, label: a.label })), { id: 'not_sure' as const, label: 'Not sure' }].map(o => (
            <label key={o.id} className={pill}>
              <input type="radio" name="hardest" checked={hardest === o.id} onChange={() => setHardest(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="t-small text-alert">{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>{busy ? 'Building your plan…' : 'Build my plan'}</Button>
    </form>
  );
}
