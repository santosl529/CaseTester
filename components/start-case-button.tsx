'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { caseHref, type CaseMode } from '@/lib/site/case-href';
import { limitMessage } from '@/lib/site/limit-message';

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
