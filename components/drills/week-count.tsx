import { Meter, StepDot } from '@/components/brand/progress';

// A week's count (Matt, 13 Nov): "Workouts 2 / 4" with a small bar until it's
// met, then a green check. On Today and Your plan.
export function WeekCount({ name, done, target }: { name: string; done: number; target: number }) {
  const met = done >= target;
  return (
    <li className="flex items-center gap-3">
      <span><span className="font-semibold">{name}</span> <span className="tabular-nums">{done} / {target}</span></span>
      {met
        ? <span className="inline-flex items-center gap-1.5"><StepDot state="done" /><span className="sr-only">complete</span></span>
        : <Meter value={done / target} label={`${name} this week: ${done} of ${target}`} className="w-16" />}
    </li>
  );
}
