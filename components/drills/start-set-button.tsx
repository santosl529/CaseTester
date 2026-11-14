'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// Starts a drill set (a workout block, a suggestion or a quick start) and
// opens it. If another set is in progress, opens that one instead.
// `name`: the accessible name when the visible label is short ("Start" on a drill card).
export function StartSetButton({ body, label, name, variant = 'default', size = 'default' }: {
  body: Record<string, unknown>; label: string; name?: string;
  variant?: 'default' | 'outline' | 'ghost'; size?: 'default' | 'sm' | 'lg';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function start() {
    setBusy(true);
    const res = await fetch('/api/drills/sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok || data.error === 'set_in_progress') router.push(`/drills/sets/${data.set_id}`);
    else setError(data.message ?? 'Could not start the set.');
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant={variant} size={size} onClick={start} disabled={busy} aria-label={name}>{label}</Button>
      {error && <span role="alert" className="t-label text-alert">{error}</span>}
    </span>
  );
}
