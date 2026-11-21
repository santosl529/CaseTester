'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { drillFetch } from '@/lib/drills/client-fetch';
import { useStartSet } from './use-start-set';

// Start or dismiss a prescription (docs/prd-drills.md "Lifecycle"). Starting
// lets the progress engine pick the drill, stage and tier.
// extra: added to the start request (Your progress marks its Practice clicks).
export function PrescriptionActions({ id, paused, extra = {}, startLabel }: { id: string; paused: boolean; extra?: Record<string, unknown>; startLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { start: startSet, busy: starting, error: startError, dialog } = useStartSet();
  const start = () => startSet({ prescription_id: id, ...extra });

  async function dismiss() {
    setBusy(true);
    const res = await drillFetch(`/api/prescriptions/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError('Could not dismiss it.');
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      {/* Outline: these sit in lists, so a page keeps one primary button. */}
      {!paused && <Button size="sm" variant="outline" onClick={start} disabled={busy || starting}>{startLabel ?? 'Start'}</Button>}
      <Button size="sm" variant="ghost" onClick={dismiss} disabled={busy || starting}>Dismiss</Button>
      {(error || startError) && <span role="alert" className="t-label text-alert">{error || startError}</span>}
      {dialog}
    </span>
  );
}
