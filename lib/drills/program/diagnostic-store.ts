// The diagnostic against the database (docs/prd-drills.md "Onboarding and
// diagnostic"): one flow of short parts, no per-item feedback, no state
// changes from its sets. Placement only moves skills from Not started to
// Learning (with a starting stage), and is redone as parts finish.
import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { diagnostics, drillSets, drillTiers, prescriptions } from '@/db/schema';
import { DRILLS_CONFIG, getDrill, getSkill } from '../config';
import { isLiveDrill } from '../live';
import { newProgress, stageDrills, type Stage, type Transition } from '../progress/engine';
import {
  activeFor, createPrescription, loadProgress, loadTiers, progressContext, saveProgress, type PendingEvent,
} from '../progress/store';
import type { ItemResult } from '../sets/scoring';
import { skillTotals } from '../sets/summary';
import {
  diagnosticParts, diagnosticPrescriptions, overallScore, placements, type DiagnosticPart, type Place,
} from './diagnostic';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DiagnosticRow = typeof diagnostics.$inferSelect;

export async function latestDiagnostic(studentId: string): Promise<DiagnosticRow | null> {
  const [row] = await db.select().from(diagnostics).where(eq(diagnostics.studentId, studentId)).orderBy(desc(diagnostics.startedAt)).limit(1);
  return row ?? null;
}

// Starts the diagnostic, or resumes it: a diagnostic stopped partway
// ("I'll take a case first") picks up where it was.
export async function startDiagnostic(studentId: string): Promise<DiagnosticRow> {
  const [current] = await db.select().from(diagnostics)
    .where(and(eq(diagnostics.studentId, studentId), eq(diagnostics.status, 'in_progress')));
  if (current) return current;
  const latest = await latestDiagnostic(studentId);
  if (latest?.status === 'skipped' && (latest.parts as DiagnosticPart[]).some(p => !p.done)) {
    const [resumed] = await db.update(diagnostics).set({ status: 'in_progress', completedAt: null })
      .where(eq(diagnostics.id, latest.id)).returning();
    return resumed;
  }
  const [row] = await db.insert(diagnostics).values({ studentId, parts: diagnosticParts() }).onConflictDoNothing().returning();
  return row ?? (await latestDiagnostic(studentId))!;
}

// "I'll take a case first": skip (or stop) the diagnostic. Parts already
// finished have placed the student.
export async function skipDiagnostic(studentId: string): Promise<void> {
  const updated = await db.update(diagnostics).set({ status: 'skipped', completedAt: new Date() })
    .where(and(eq(diagnostics.studentId, studentId), eq(diagnostics.status, 'in_progress'))).returning({ id: diagnostics.id });
  if (!updated.length) await db.insert(diagnostics).values({ studentId, parts: diagnosticParts(), status: 'skipped', completedAt: new Date() });
}

export type PartStatus = 'todo' | 'in_progress' | 'grading' | 'done';

export async function diagnosticView(studentId: string) {
  const row = await latestDiagnostic(studentId);
  if (!row) return null;
  const parts = row.parts as DiagnosticPart[];
  const ids = parts.map(p => p.set_id).filter((x): x is string => Boolean(x));
  const sets = ids.length ? await db.select({ id: drillSets.id, status: drillSets.status }).from(drillSets).where(inArray(drillSets.id, ids)) : [];
  const status = (p: DiagnosticPart): PartStatus => {
    if (p.done) return 'done';
    const s = sets.find(x => x.id === p.set_id);
    return !s || s.status === 'expired' ? 'todo' : s.status === 'grading' ? 'grading' : s.status === 'completed' ? 'done' : 'in_progress';
  };
  const view = parts.map((p, i) => ({ index: i, drill_id: p.drill_id, drill_name: getDrill(p.drill_id).name, size: p.size, set_id: p.set_id, status: status(p) }));
  const placed = (row.placements ?? {}) as Record<string, { score: number; count: number; place: Place }>;
  return {
    id: row.id, status: row.status, parts: view,
    next: view.find(p => p.status !== 'done' && p.status !== 'grading') ?? null,
    grading: view.some(p => p.status === 'grading'),
    done: view.filter(p => p.status === 'done').length,
    overall_score: row.overallScore,
    moved_to_track: row.movedToTrack,
    placements: Object.entries(placed).map(([id, p]) => ({ skill_id: id, skill_name: getSkill(id).name, area: getSkill(id).area, ...p })),
  };
}

// Records the set on its part when the part starts.
export async function attachDiagnosticSet(diagnosticId: string, index: number, setId: string) {
  const [row] = await db.select().from(diagnostics).where(eq(diagnostics.id, diagnosticId));
  const parts = row.parts as DiagnosticPart[];
  parts[index] = { ...parts[index], set_id: setId };
  await db.update(diagnostics).set({ parts }).where(eq(diagnostics.id, diagnosticId));
}

const STAGE: Record<Place, Stage | null> = { recognize: 'recognize', recognize_t2: 'recognize', repair: 'repair', test_out: null };

// Runs in finalizeSet's transaction when a diagnostic part's set is scored:
// stores the part's totals, redoes placement from every finished part, and
// finishes the diagnostic after the last part. Returns events to log, and
// the overall score when the diagnostic is complete.
export async function onDiagnosticSetDone(tx: Tx, set: typeof drillSets.$inferSelect,
  attempts: { skills: string[]; result: ItemResult }[]): Promise<{ events: PendingEvent[]; completed: number | null }> {
  const [row] = await tx.select().from(diagnostics)
    .where(and(eq(diagnostics.studentId, set.studentId), inArray(diagnostics.status, ['in_progress', 'skipped'])))
    .orderBy(desc(diagnostics.startedAt)).limit(1).for('update');
  const parts = (row?.parts ?? []) as DiagnosticPart[];
  const index = parts.findIndex(p => p.set_id === set.id);
  if (!row || index < 0) return { events: [], completed: null };
  const totals = Object.fromEntries(skillTotals(attempts));
  parts[index] = {
    ...parts[index], done: true, totals, item_scores: attempts.map(a => a.result.score),
    miss_tags: attempts.filter(a => !a.result.skipped && a.result.score < 1).flatMap(a => a.result.mistake_tags),
  };

  // Placement: only skills a student hasn't practiced yet (Not started, or
  // Learning with no practice), moved to Learning with a starting stage.
  const placed = placements(parts, isLiveDrill);
  const studentId = set.studentId;
  const before = await loadProgress(tx, studentId, true);
  const after = new Map([...before].map(([k, v]) => [k, { ...v }]));
  const transitions: Transition[] = [];
  for (const [skillId, p] of Object.entries(placed)) {
    const s = after.get(skillId);
    if (s && (s.state !== 'not_started' && s.state !== 'learning')) continue;
    if (s && s.last_practiced_at) continue;
    const next = s ?? newProgress(skillId);
    if (next.state === 'not_started') transitions.push({ skill_id: skillId, from: 'not_started', to: 'learning', reason: 'diagnostic placement' });
    next.state = 'learning';
    next.stage = STAGE[p.place];
    after.set(skillId, next);
    // Recognize at tier 1 or tier 2, unless the student already has a tier there.
    const recognize = stageDrills(skillId, isLiveDrill).recognize;
    if (recognize && (p.place === 'recognize' || p.place === 'recognize_t2')) {
      const practiced = await tx.select({ id: drillSets.id }).from(drillSets).where(and(
        eq(drillSets.studentId, studentId), eq(drillSets.drillId, recognize), eq(drillSets.status, 'completed'))).limit(5);
      const own = practiced.length === 0 || (await tx.select({ id: drillSets.id }).from(drillSets).where(and(
        inArray(drillSets.id, practiced.map(x => x.id)), eq(drillSets.source, 'diagnostic')))).length === practiced.length;
      if (own) {
        const tier = p.place === 'recognize_t2' ? 2 : 1;
        await tx.insert(drillTiers).values({ studentId, drillId: recognize, currentTier: tier, updatedAt: new Date() })
          .onConflictDoUpdate({ target: [drillTiers.studentId, drillTiers.drillId], set: { currentTier: tier, updatedAt: new Date() } });
      }
    }
  }
  const events = await saveProgress(tx, studentId, before, after, transitions, { type: 'set', id: `diagnostic:${row.id}` });

  const complete = parts.every(p => p.done);
  const overall = overallScore(parts);
  await tx.update(diagnostics).set({
    parts, placements: placed, overallScore: overall,
    ...(complete && { status: 'completed' as const, completedAt: new Date() }),
  }).where(eq(diagnostics.id, row.id));
  if (!complete) return { events, completed: null };

  // Up to 3 prescriptions from the diagnostic's mistakes, for skills with none open.
  const open = new Set((await tx.select({ s: prescriptions.skillId }).from(prescriptions)
    .where(and(eq(prescriptions.studentId, studentId), inArray(prescriptions.status, ['open', 'in_progress', 'paused'])))).map(r => r.s));
  const ctx = await progressContext(tx, studentId);
  const tiers = await loadTiers(tx, studentId);
  for (const rx of diagnosticPrescriptions(parts, open, isLiveDrill)) {
    if ((await activeFor(tx, studentId, rx.skill_id)).length) continue;
    events.push(...await createPrescription(tx, studentId, after, tiers, ctx, {
      skill_id: rx.skill_id, priority: rx.priority, reason: rx.reason, source_type: 'diagnostic', source_id: row.id,
    }));
  }
  events.push({ type: 'diagnostic_completed', props: {
    diagnostic_id: row.id, overall_score: overall,
    placements: Object.fromEntries(Object.entries(placed).map(([k, v]) => [k, v.place])),
  } });
  return { events, completed: overall };
}

// The diagnostic moved the student to another track (shown on its results).
export async function markDiagnosticMove(studentId: string, track: 'foundations') {
  const latest = await latestDiagnostic(studentId);
  if (latest) await db.update(diagnostics).set({ movedToTrack: track }).where(eq(diagnostics.id, latest.id));
}

export const DIAGNOSTIC_PARTS = DRILLS_CONFIG.programs.diagnostic.parts.length;
