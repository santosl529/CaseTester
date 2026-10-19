'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Start or dismiss a prescription (docs/prd-drills.md "Lifecycle"). Starting
// lets the progress engine pick the drill, stage and tier.
// extra: added to the start request (Your progress marks its Practice clicks).
export function PrescriptionActions({ id, paused, extra = {}, startLabel }: { id: string; paused: boolean; extra?: Record<string, unknown>; startLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    const res = await fetch('/api/drills/sets', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prescription_id: id, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok || data.error === 'set_in_progress') router.push(`/drills/sets/${data.set_id}`);
    else setError(data.message ?? 'Could not start the set.');
  }

  async function dismiss() {
    setBusy(true);
    const res = await fetch(`/api/prescriptions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError('Could not dismiss it.');
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {!paused && <Button size="sm" onClick={start} disabled={busy}>{startLabel ?? 'Start'}</Button>}
      <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy}>Dismiss</Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
