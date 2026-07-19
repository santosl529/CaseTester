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
      <span className="text-sm">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            aria-label={`${label}: ${n} of 5`}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`size-8 rounded-md border text-sm transition-colors ${
              value === n
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100'
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
        <CardContent className="text-sm text-neutral-600">
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
      <CardHeader><CardTitle className="text-base">How was this interview?</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <RatingRow label="How realistic did the interviewer feel?" value={realism} onChange={setRealism} />
        <RatingRow label="How useful is this feedback?" value={usefulness} onChange={setUsefulness} />
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={blindOptIn}
            onChange={e => setBlindOptIn(e.target.checked)}
            className="mt-0.5"
          />
          I&apos;m open to comparing this feedback against another AI&apos;s feedback on the same answers (helps us measure quality).
        </label>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={submit} disabled={realism === null || usefulness === null || state === 'submitting'}>
            {state === 'submitting' ? 'Submitting…' : 'Submit'}
          </Button>
          {state === 'error' && <span className="text-sm text-red-600">Something went wrong — try again.</span>}
        </div>
      </CardContent>
    </Card>
  );
}
