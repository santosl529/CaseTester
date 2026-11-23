'use client';
import { Button } from '@/components/ui/button';
import { useStartSet } from './use-start-set';

// Starts a drill set (a workout block, a suggestion or a quick start) and opens it. If another set is unfinished, it
// asks first: resume that one, or start this one instead (useStartSet).
// `name`: the accessible name when the visible label is short ("Start" on a drill card).
// `track`: a case report's next steps (Matt, 15 Nov): the click is logged as next_step_clicked.
export function StartSetButton({ body, label, name, variant = 'default', size = 'default', track }: {
  body: Record<string, unknown>; label: string; name?: string;
  variant?: 'default' | 'outline' | 'ghost'; size?: 'default' | 'sm' | 'lg'; track?: Record<string, unknown>;
}) {
  const { start, busy, error, dialog } = useStartSet();
  function click() {
    if (busy) return;
    if (track) navigator.sendBeacon?.('/api/drills/next-steps', new Blob([JSON.stringify(track)], { type: 'application/json' }));
    void start(body);
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button variant={variant} size={size} onClick={click} disabled={busy} aria-label={name}>{label}</Button>
      {error && <span role="alert" className="t-label text-alert">{error}</span>}
      {dialog}
    </span>
  );
}
