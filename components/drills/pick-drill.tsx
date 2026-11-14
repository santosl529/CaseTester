'use client';
import { useState } from 'react';
import { StartSetButton } from './start-set-button';

// The drill's kind in plain words (Matt, 13 Nov).
const STAGE = { recognize: 'Spot it', repair: 'Fix it', construct: 'Build it' } as const;

export interface PickableDrill {
  stage: keyof typeof STAGE;
  drill_id: string;
  name: string;
  items: number | null;
  current_tier: number | null;
  tiers: number[];
}

// "Pick exactly" (docs/prd-drills.md "Browse drills"): a drill and a tier up to
// one above the student's current tier on it. Students see tiers as Levels (Matt, 13 Nov).
// `compact` (a Browse drills card): `meta` ("8 items · 6 min") on the left, and
// a plain Start; the drill's kind is on its intro screen (Matt, 13 Nov).
export function PickDrill({ skillId, drill, compact = false, meta }: { skillId: string; drill: PickableDrill; compact?: boolean; meta?: string }) {
  const [tier, setTier] = useState(drill.current_tier ?? Math.max(...drill.tiers));
  return (
    <div className="space-y-1.5 pt-1">
    <div className="t-small flex flex-wrap items-center justify-between gap-3">
      {compact ? <span className="text-ink/70">{meta}</span> : (
        <span>
          <span className="text-ink/70">{STAGE[drill.stage]} · </span>
          <span className="font-semibold">{drill.name}</span>
          {drill.items && <span className="text-ink/70"> · {drill.items} items</span>}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2">
        <fieldset className="flex items-center gap-1">
          <legend className="sr-only">Level for {drill.name}</legend>
          {drill.tiers.map(t => (
            <label key={t} className="flex h-9 cursor-pointer items-center rounded-full border border-ink/20 bg-white px-3 transition-colors hover:border-ink/40 has-[:checked]:border-cobalt has-[:checked]:bg-sky/50 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cobalt motion-reduce:transition-none">
              <input type="radio" name={`tier-${skillId}-${drill.drill_id}`} checked={tier === t} onChange={() => setTier(t)} className="sr-only" />
              Level {t}
            </label>
          ))}
        </fieldset>
        <StartSetButton body={{ drill_id: drill.drill_id, skill_id: skillId, tier, browse: true }} label="Start" name={`Start ${drill.name}`} size="sm" variant="outline" />
      </span>
    </div>
    {drill.tiers.length > 1 && <p className="t-label text-right text-ink/70">Higher levels have harder items.</p>}
    </div>
  );
}
