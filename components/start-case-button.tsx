'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Starts a case from /home. No club code is sent: /api/session reads the one
// on the student's profile (site flow, 19 Oct).
export function StartCaseButton({ caseId, label }: { caseId: string; label: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function start() {
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
