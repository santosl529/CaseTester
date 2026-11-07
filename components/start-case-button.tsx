'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { caseHref, type CaseMode } from '@/lib/site/case-href';

// Starts a case from /home or a start link (/start/<caseId>). No club code is sent: /api/session reads the one
// on the student's profile (site flow, 19 Oct). A second click before the disabled state renders is ignored.
// Voice is the default (Lorenzo, 6 Nov); "Prefer to type?" starts the same case in text.
export function StartCaseButton({ caseId, label }: { caseId: string; label: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const inFlight = useRef(false);

  async function start(mode: CaseMode) {
    if (inFlight.current) return;
    inFlight.current = true;
    setStarting(true);
    setError('');
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error === 'Invalid club code' ? 'Your club code is no longer valid. Contact your club president.'
        : data.error === 'session_limit' ? limitMessage(data)
        : 'Failed to start case. Please try again.');
      setStarting(false);
      inFlight.current = false;
      return;
    }
    const { sessionId } = await res.json();
    router.push(caseHref(sessionId, mode));
  }

  return (
    <div className="space-y-1">
      <Button onClick={() => start('voice')} disabled={starting} className="w-full" size="lg">{starting ? 'Starting…' : label}</Button>
      <p className="text-center text-xs text-neutral-500">
        Spoken out loud — headphones work best.{' '}
        <button type="button" onClick={() => start('text')} disabled={starting} className="underline disabled:opacity-50">Prefer to type? Start in text</button>
      </p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}

// The start limits (lib/session-limits.ts), in the student's own time zone.
function limitMessage({ reason, limit, retryAt }: { reason?: string; limit?: number; retryAt?: string }): string {
  const when = retryAt ? new Date(retryAt) : null;
  const at = when ? when.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'later';
  if (reason === 'daily') return `You've started ${limit} interviews in the last 24 hours, the most allowed. You can start another from ${at}.`;
  if (reason === 'monthly') return `You've used your ${limit} interviews for this month. Your limit resets on ${when ? when.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'the 1st'}.`;
  return "We've reached this month's interview limit for the whole site. Please try again next month.";
}
