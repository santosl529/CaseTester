import Link from 'next/link';
import { DRILLS_CONFIG } from '@/lib/drills/config';
import { drillForSkill, inProgressSet, settingsFor } from '@/lib/drills/sets/service';
import { studentOrRedirect } from '@/lib/drills/session';
import { DrillPicker, type PickerArea } from '@/components/drills/picker';

// "Practice something specific" (docs/prd-drills.md): pick a skill area, then
// a skill; the system picks the drill and tier, and the student can override
// the level. Only skills with a live drill are listed.
export default async function DrillsPage() {
  const studentId = await studentOrRedirect();
  const [current, settings] = await Promise.all([inProgressSet(studentId), settingsFor(studentId)]);
  const { areas, skills } = DRILLS_CONFIG.taxonomy;

  const pickerAreas: PickerArea[] = areas.map(area => ({
    code: area.code,
    name: area.name,
    skills: skills.filter(s => s.area === area.code).flatMap(s => {
      const l1 = drillForSkill(s.id, 1), l2 = drillForSkill(s.id, 2);
      if (!l1 && !l2) return [];
      return [{ id: s.id, name: s.name, description: s.description, levels: { 1: l1?.name ?? null, 2: l2?.name ?? null } }];
    }),
  })).filter(a => a.skills.length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Drills</h1>
        <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">Back to cases</Link>
      </header>
      {current && (
        <p className="rounded-lg border p-3 text-sm">
          You have a set in progress.{' '}
          <Link href={`/drills/sets/${current.id}`} className="font-medium underline underline-offset-4">Resume it</Link>
        </p>
      )}
      <DrillPicker areas={pickerAreas} timeMultiplier={settings.timeMultiplier} />
    </main>
  );
}
