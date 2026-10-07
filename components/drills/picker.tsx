'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface PickerArea {
  code: string;
  name: string;
  skills: { id: string; name: string; description: string; levels: { 1: string | null; 2: string | null } }[];
}

const LEVEL_NAMES = { 1: 'Level 1: Recognize', 2: 'Level 2: Generate' } as const;

export function DrillPicker({ areas, timeMultiplier }: { areas: PickerArea[]; timeMultiplier: number }) {
  const router = useRouter();
  const [areaCode, setAreaCode] = useState(areas[0]?.code ?? '');
  const [skillId, setSkillId] = useState<string | null>(null);
  const [level, setLevel] = useState<1 | 2 | null>(null);
  const [multiplier, setMultiplier] = useState(timeMultiplier);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const area = areas.find(a => a.code === areaCode);
  const skill = area?.skills.find(s => s.id === skillId) ?? null;
  // Default level: Level 2 where it exists (PRD: the system picks; the student may override).
  const effectiveLevel = level ?? (skill?.levels[2] ? 2 : 1);

  async function start() {
    if (!skill) return;
    setBusy(true);
    setError('');
    const res = await fetch('/api/drills/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_id: skill.id, level: effectiveLevel }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok || data.error === 'set_in_progress') {
      router.push(`/drills/sets/${data.set_id}`);
      return;
    }
    setError(data.message ?? 'Could not start the set. Please try again.');
  }

  async function saveMultiplier(value: number) {
    setMultiplier(value);
    await fetch('/api/me/drill-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ time_multiplier: value }),
    });
  }

  if (areas.length === 0) return <p className="text-sm text-muted-foreground">No drills are available yet.</p>;

  return (
    <div className="space-y-6">
      <section aria-labelledby="area-heading" className="space-y-2">
        <h2 id="area-heading" className="text-sm font-medium">1. Skill area</h2>
        <div role="radiogroup" aria-labelledby="area-heading" className="flex flex-wrap gap-2">
          {areas.map(a => (
            <label key={a.code} className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input type="radio" name="area" className="sr-only" checked={a.code === areaCode}
                onChange={() => { setAreaCode(a.code); setSkillId(null); setLevel(null); }} />
              {a.name}
            </label>
          ))}
        </div>
      </section>

      {area && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">2. Skill</legend>
          {area.skills.map(s => (
            <label key={s.id} className="flex cursor-pointer gap-3 rounded-lg border p-3 has-checked:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
              <input type="radio" name="skill" className="mt-1" checked={s.id === skillId}
                onChange={() => { setSkillId(s.id); setLevel(null); }} />
              <span>
                <span className="block text-sm font-medium">{s.name}</span>
                <span className="block text-sm text-muted-foreground">{s.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {skill && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">3. Level</legend>
          {([1, 2] as const).map(l => (
            <label key={l} className={`flex gap-3 rounded-lg border p-3 has-checked:border-primary ${skill.levels[l] ? 'cursor-pointer' : 'opacity-50'}`}>
              <input type="radio" name="level" disabled={!skill.levels[l]} checked={effectiveLevel === l} onChange={() => setLevel(l)} />
              <span className="text-sm">
                <span className="font-medium">{LEVEL_NAMES[l]}</span>
                <span className="text-muted-foreground"> — {skill.levels[l] ?? 'not available yet'}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button onClick={start} disabled={!skill || busy} size="lg">{busy ? 'Starting…' : 'Start drill'}</Button>
        <label className="flex items-center gap-2 text-sm">
          Extra time
          <select className="rounded-md border bg-background px-2 py-1" value={multiplier}
            onChange={e => saveMultiplier(Number(e.target.value))}>
            <option value={1}>None</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
