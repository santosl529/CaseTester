'use client';
import { Button } from '@/components/ui/button';
import { useStartSet } from './use-start-set';

export function RetryButton({ drillId, skillId }: { drillId: string; skillId: string | null }) {
  const { start, busy, error, dialog } = useStartSet('Could not start a new set.');
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant="outline" size="lg" onClick={() => start({ drill_id: drillId, ...(skillId && { skill_id: skillId }) })} disabled={busy}>Retry this drill</Button>
      {error && <span role="alert" className="t-label text-alert">{error}</span>}
      {dialog}
    </span>
  );
}
