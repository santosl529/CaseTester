'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface AvailabilityOption { id: string; label: string; workouts_per_week: number; default?: boolean }

// Onboarding (docs/prd-drills.md "Onboarding and diagnostic"): plan or
// practice on my own, interview date, practice cases done and, for plans,
// time per week. The time zone comes from the browser; nothing to answer.
export function OnboardingForm({ availability, today }: { availability: AvailabilityOption[]; today: string }) {
  const router = useRouter();
  const [wantsPlan, setWantsPlan] = useState(true);
  const [interviewDate, setInterviewDate] = useState('');
  const [casesDone, setCasesDone] = useState<'0' | '1-5' | '6+' | ''>('');
  const [hours, setHours] = useState(availability.find(a => a.default)?.id ?? availability[0].id);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!casesDone) { setError('Tell us how many practice cases you have done.'); return; }
    setBusy(true);
    setError('');
    const res = await fetch('/api/drills/onboarding', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wants_plan: wantsPlan, interview_date: interviewDate || null, cases_done: casesDone,
        availability: wantsPlan ? hours : undefined, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.message ?? 'Something went wrong. Please try again.'); return; }
    // Next: the training home, which offers three ways to get the plan
    // (questions, the diagnostic or a case).
    router.push('/drills');
  }

  const radio = 'flex items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-foreground';
  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">How do you want to practice?</legend>
        <label className={radio}>
          <input type="radio" name="mode" checked={wantsPlan} onChange={() => setWantsPlan(true)} className="mt-1" />
          <span><span className="font-medium">Follow a plan</span><br /><span className="text-muted-foreground">A week-by-week program with a daily workout, built around your weak spots.</span></span>
        </label>
        <label className={radio}>
          <input type="radio" name="mode" checked={!wantsPlan} onChange={() => setWantsPlan(false)} className="mt-1" />
          <span><span className="font-medium">Practice on my own</span><br /><span className="text-muted-foreground">Pick drills and cases yourself. We still track your weaknesses and suggest what to do next.</span></span>
        </label>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="interview" className="block font-medium">When is your interview? <span className="font-normal text-muted-foreground">(optional)</span></label>
        <input id="interview" type="date" min={today} value={interviewDate} onChange={e => setInterviewDate(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm sm:w-auto" />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">How many practice cases have you done?</legend>
        <div className="flex flex-wrap gap-2">
          {(['0', '1-5', '6+'] as const).map(v => (
            <label key={v} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm has-[:checked]:border-foreground">
              <input type="radio" name="cases" checked={casesDone === v} onChange={() => setCasesDone(v)} />
              {v === '1-5' ? '1–5' : v}
            </label>
          ))}
        </div>
      </fieldset>

      {wantsPlan && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">How much time do you have each week?</legend>
          {availability.map(a => (
            <label key={a.id} className={radio}>
              <input type="radio" name="hours" checked={hours === a.id} onChange={() => setHours(a.id)} className="mt-1" />
              <span>{a.label} <span className="text-muted-foreground">({a.workouts_per_week} workouts a week, plus cases)</span></span>
            </label>
          ))}
        </fieldset>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={busy}>{wantsPlan ? 'Next: get your plan' : 'Next: find your starting point'}</Button>
    </form>
  );
}
