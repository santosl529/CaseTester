'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function RetryButton({ drillId, skillId }: { drillId: string; skillId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function retry() {
    setBusy(true);
    const res = await fetch('/api/drills/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drill_id: drillId, ...(skillId && { skill_id: skillId }) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok || data.error === 'set_in_progress') router.push(`/drills/sets/${data.set_id}`);
    else setError(data.message ?? 'Could not start a new set.');
  }
  return (
    <span className="inline-flex flex-col">
      <Button variant="outline" size="lg" onClick={retry} disabled={busy}>Retry this drill</Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
