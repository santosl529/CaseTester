// Browse drills (docs/prd-drills.md "Browse drills"): every skill area and
// skill with its state and stage, its live drills by stage, the tiers the
// student may pick, and a Suggested badge for skills with an open prescription.
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { prescriptions } from '@/db/schema';
import { DRILLS_CONFIG, getDrill } from '../config';
import { isLiveDrill } from '../live';
import { newProgress, stageDrills, type Stage } from '../progress/engine';
import { loadProgress, loadTiers } from '../progress/store';
import { lessonSkills } from './lessons-store';
import { allowedTiers } from './tiers';

const STAGES: Stage[] = ['recognize', 'repair', 'construct'];

export async function catalog(studentId: string) {
  const [progress, tiers, open, lessons] = await Promise.all([
    loadProgress(db, studentId), loadTiers(db, studentId),
    db.select({ skillId: prescriptions.skillId }).from(prescriptions)
      .where(and(eq(prescriptions.studentId, studentId), inArray(prescriptions.status, ['open', 'in_progress', 'paused']))),
    lessonSkills(),
  ]);
  const suggested = new Set(open.map(r => r.skillId));
  return DRILLS_CONFIG.taxonomy.areas.map(area => ({
    code: area.code, name: area.name,
    skills: DRILLS_CONFIG.taxonomy.skills.filter(s => s.area === area.code).flatMap(s => {
      const byStage = stageDrills(s.id, isLiveDrill);
      const drills = STAGES.filter(st => byStage[st]).map(st => {
        const d = getDrill(byStage[st]!);
        return {
          stage: st, drill_id: d.id, name: d.name, items: d.set_size, current_tier: tiers[d.id] ?? null,
          tiers: allowedTiers(tiers[d.id]),
        };
      });
      if (!drills.length) return [];
      const p = progress.get(s.id) ?? newProgress(s.id);
      return [{
        id: s.id, name: s.name, description: s.description, state: p.state, stage: p.stage,
        suggested: suggested.has(s.id), has_lesson: lessons.has(s.id), drills,
      }];
    }),
  })).filter(a => a.skills.length > 0);
}
