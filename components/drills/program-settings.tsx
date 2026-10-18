'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { AvailabilityOption } from './onboarding-form';

type Track = 'foundations' | 'standard' | 'sprint' | 'self_directed';
const TRACKS: { id: Track; label: string; hint: string }[] = [
  { id: 'foundations', label: 'Foundations', hint: 'New to cases: six weeks, starting from the basics, with lessons.' },
  { id: 'standard', label: 'Standard', hint: 'Six weeks, starting where the diagnostic placed you.' },
  { id: 'sprint', label: 'Sprint', hint: 'Seven days before an interview: timed practice and cases.' },
  { id: 'self_directed', label: 'Practice on my own', hint: 'No plan; suggestions only.' },
];

// Settings (docs/prd-drills.md "Interview date", "Tracks"): switching track
// or changing the interview date or time per week rebuilds the plan from
// today; skill states are kept.
export function ProgramSettings({ track, interviewDate, availabilityId, availability, today, timeMultiplier, untimed, feedbackMode }: {
  track: Track; interviewDate: string | null; availabilityId: string; availability: AvailabilityOption[]; today: string; timeMultiplier: number; untimed: boolean;
  feedbackMode: 'immediate' | 'end';
}) {
  const router = useRouter();
  const [t, setT] = useState(track);
  const [date, setDate] = useState(interviewDate ?? '');
  const [hours, setHours] = useState(availabilityId);
  // One choice: a time multiplier, or no time limit (WCAG 2.2.1).
  const savedTime = untimed ? 'untimed' : String(timeMultiplier);
  const [time, setTime] = useState(savedTime);
  // Feedback timing: the default each set's intro screen starts from.
  const [feedback, setFeedback] = useState(feedbackMode);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const changes: Record<string, unknown> = {};
    if (t !== track) changes.track = t;
    if ((date || null) !== interviewDate) changes.interview_date = date || null;
    if (hours !== availabilityId) changes.availability = hours;
    const calls: Promise<Response>[] = [];
    if (Object.keys(changes).length) calls.push(fetch('/api/drills/program', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) }));
    if (time !== savedTime || feedback !== feedbackMode) {
      const body = {
        ...(time !== savedTime && (time === 'untimed' ? { untimed: true } : { time_multiplier: Number(time), untimed: false })),
        ...(feedback !== feedbackMode && { feedback_mode: feedback }),
      };
      calls.push(fetch('/api/me/drill-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    }
    const results = await Promise.all(calls);
    setBusy(false);
    const failed = results.find(r => !r.ok);
    if (failed) { setMsg((await failed.json().catch(() => ({}))).message ?? 'Could not save.'); return; }
    router.push('/drills');
    router.refresh();
  }

  const radio = 'flex items-start gap-3 rounded-lg border p-3 text-sm has-[:checked]:border-foreground';
  return (
    <form onSubmit={save} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Track</legend>
        {TRACKS.map(x => (
          <label key={x.id} className={radio}>
            <input type="radio" name="track" checked={t === x.id} onChange={() => setT(x.id)} className="mt-1" />
            <span><span className="font-medium">{x.label}</span><br /><span className="text-muted-foreground">{x.hint}</span></span>
          </label>
        ))}
      </fieldset>
      <div className="space-y-2">
        <label htmlFor="interview" className="block font-medium">Interview date</label>
        <div className="flex flex-wrap items-center gap-3">
          <input id="interview" type="date" min={today} value={date} onChange={e => setDate(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm" />
          {date && <button type="button" onClick={() => setDate('')} className="text-sm underline underline-offset-4">Clear</button>}
        </div>
      </div>
      {t !== 'self_directed' && t !== 'sprint' && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-medium">Time each week</legend>
          {availability.map(a => (
            <label key={a.id} className={radio}>
              <input type="radio" name="hours" checked={hours === a.id} onChange={() => setHours(a.id)} className="mt-1" />
              <span>{a.label} ({a.workouts_per_week} workouts a week)</span>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Time per item</legend>
        <div className="flex flex-wrap gap-2">
          {[['1', 'Standard'], ['1.5', '1.5×'], ['2', '2×'], ['untimed', 'No time limit']].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm has-[:checked]:border-foreground">
              <input type="radio" name="time" checked={time === value} onChange={() => setTime(value)} />
              {label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">No time limit hides the timer. Your results still show how long you took against the timed target, so you can work on pace.</p>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">Feedback</legend>
        <div className="flex flex-wrap gap-2">
          {([['immediate', 'After each question'], ['end', 'At the end of the set']] as const).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm has-[:checked]:border-foreground">
              <input type="radio" name="feedback" checked={feedback === value} onChange={() => setFeedback(value)} />
              {label}
            </label>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">The default for new sets; you can change it on each set&apos;s first screen. Scores and progress are the same either way.</p>
      </fieldset>
      <p className="text-sm text-muted-foreground">Changes rebuild your plan from today. Your skill progress is kept.</p>
      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      <Button type="submit" disabled={busy}>Save</Button>
    </form>
  );
}
