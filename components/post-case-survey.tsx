'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// PRD §13: post-case realism/usefulness ratings + blind-comparison opt-in.
// Feeds the M1 gate metric (≥65% blind preference vs ChatGPT) and the M2
// realism gate (≥4.0). Fire-and-forget analytics — a failed submit is
// swallowed after showing a retry-able error, never blocks the report.

function RatingRow({ label, value, onChange }: {
  label: string;
  value: number | null;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="t-small">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} of 5`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`t-small size-9 cursor-pointer rounded-full border tabular-nums transition-colors motion-reduce:transition-none ${
              value === n
                ? 'border-cobalt bg-cobalt font-semibold text-white'
                : 'border-ink/20 bg-white text-ink hover:border-ink/45'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PostCaseSurvey({ sessionId }: { sessionId: string }) {
  const [realism, setRealism] = useState<number | null>(null);
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [blindOptIn, setBlindOptIn] = useState(false);
  const [state, setState] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  if (state === 'done') {
    return (
      <Card>
        <CardContent className="t-small text-ink/70">
          Thanks — your feedback helps us improve the interviewer.
        </CardContent>
      </Card>
    );
  }

  const submit = async () => {
    if (realism === null || usefulness === null) return;
    setState('submitting');
    try {
      const res = await fetch(`/api/feedback/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ realism, usefulness, blindOptIn }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>How was this interview?</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <RatingRow label="How realistic did the interviewer feel?" value={realism} onChange={setRealism} />
        <RatingRow label="How useful is this feedback?" value={usefulness} onChange={setUsefulness} />
        <label className="t-small flex items-start gap-2.5 text-ink/80">
          <input
            type="checkbox"
            checked={blindOptIn}
            onChange={e => setBlindOptIn(e.target.checked)}
            className="mt-1 accent-cobalt"
          />
          I&apos;m open to comparing this feedback against another AI&apos;s feedback on the same answers (helps us measure quality).
        </label>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={submit} disabled={realism === null || usefulness === null || state === 'submitting'}>
            {state === 'submitting' ? 'Submitting…' : 'Submit'}
          </Button>
          {state === 'error' && <span className="t-small text-alert">Something went wrong — try again.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
