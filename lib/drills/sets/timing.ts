// Time limits per step (docs/prd-drills.md). Most items have one limit for
// the whole item, counted from when it was served. HY-2 has two stages with
// their own limits: stage 2's clock starts when stage 1 is submitted and the
// new fact appears. A step with `time_limits_s` starts a new stage; steps
// without one belong to the stage before them.
import type { Drill } from '../config';
import type { Item, Tier } from '../item-schema';
import { itemSteps } from './scoring';
import { timeLimitMs } from './summary';

function stageIndex(item: Item, step: number): number {
  const spec = itemSteps(item);
  for (let j = Math.min(step, spec.length - 1); j >= 0; j--) if (spec[j].time_limits_s) return j;
  return -1;
}

export function stepLimitMs(drill: Drill, item: Item, tier: Tier, multiplier: number, step: number): number {
  const k = stageIndex(item, step);
  if (k === -1) return timeLimitMs(drill, tier, multiplier);
  return itemSteps(item)[k].time_limits_s![tier - 1] * 1000 * multiplier;
}

// When the step's stage started: the serve time, or (HY-2 stage 2) when the
// previous stage was submitted.
export function stepStartedAt(item: Item, step: number, servedAt: Date, stageStartedAt: string | null | undefined): Date {
  return stageIndex(item, step) > 0 && stageStartedAt ? new Date(stageStartedAt) : servedAt;
}

// Does the next step start a new stage (so its clock starts now)?
export const startsStage = (item: Item, step: number) => Boolean(itemSteps(item)[step]?.time_limits_s) && step > 0;

// The item's whole allowance, for the attempt record and the intro screen.
export function itemLimitsMs(drill: Drill, item: Item | null, tier: Tier, multiplier: number): number[] {
  if (!item || stageIndex(item, itemSteps(item).length - 1) === -1) return [timeLimitMs(drill, tier, multiplier)];
  const spec = itemSteps(item);
  return spec.flatMap((s, i) => (s.time_limits_s ? [stepLimitMs(drill, item, tier, multiplier, i)] : []));
}

// Drill-level limits for the intro, without an item: HY-2 from its stage limits.
export function drillLimitsMs(drill: Drill, tier: Tier, multiplier: number): number[] {
  if (drill.time_limits_s) return [drill.time_limits_s[tier - 1] * 1000 * multiplier];
  return Object.values(drill.stage_time_limits_s ?? {}).map(t => t[tier - 1] * 1000 * multiplier);
}
