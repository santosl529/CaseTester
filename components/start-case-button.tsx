'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Starts a case from /home or a start link (/start/<caseId>). No club code is sent: /api/session reads the one
// on the student's profile (site flow, 19 Oct). A second click before the disabled state renders is ignored.
export function StartCaseButton({ caseId, label }: { caseId: string; label: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const inFlight = useRef(false);

  async function start() {
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
      setError(data.error === 'Invalid club code' ? 'Your club code is no longer valid. Contact your club president.' : 'Failed to start case. Please try again.');
      setStarting(false);
      inFlight.current = false;
      return;
    }
    const { sessionId } = await res.json();
    router.push(`/case/${sessionId}`);
  }

  return (
    <div className="space-y-1">
      <Button onClick={start} disabled={starting} className="w-full" size="lg">{starting ? 'Starting…' : label}</Button>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}
