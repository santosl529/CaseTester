import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Progress in the homepage's styles: the loop's progress line (a 2px Ink
// track, Cobalt fill) and the readiness meter (a 6px track filled in Mastery
// green). Green is for progress and completion only.

// How far through something (a set's items, a plan's weeks). The words that
// say it stay beside it; the line itself is decoration.
export function ProgressLine({ value, max, className }: { value: number; max: number; className?: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div aria-hidden="true" className={cn('h-0.5 overflow-hidden rounded-full bg-ink/12', className)}>
      <div className="h-full origin-left rounded-full bg-cobalt transition-transform duration-500 ease-expo motion-reduce:transition-none" style={{ transform: `scaleX(${share})` }} />
    </div>
  );
}

// A share of something done (a week's workouts, readiness): the meter.
export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
      className={cn('relative h-1.5 w-30 min-w-14 overflow-hidden rounded-full bg-meter-track', className)}>
      <div className="absolute inset-0 origin-left rounded-full bg-mastery" style={{ transform: `scaleX(${pct / 100})` }} />
    </div>
  );
}

// The loop's step dot: done is a small green check, the current step a Cobalt
// ring, the rest a quiet outline.
export function StepDot({ state, className }: { state: 'done' | 'current' | 'todo'; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex size-4 flex-none items-center justify-center rounded-full',
      state === 'done' ? 'bg-mastery text-ink' : state === 'current' ? 'border-2 border-cobalt bg-white' : 'border border-ink/25 bg-white', className)}>
      {state === 'done' && <Check className="size-2.5" strokeWidth={3} />}
    </span>
  );
}
