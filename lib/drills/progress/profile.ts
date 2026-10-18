// The skill profile (docs/prd-drills.md "Skill profile"), open prescriptions,
// and dismissing one. Program progress arrives with the training program (D4).
import 'server-only';
import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, drillAttempts, drillSets, prescriptions } from '@/db/schema';
import { DRILLS_CONFIG, getDrill, getMistakeTag, getSkill } from '../config';
import { DrillError } from '../sets/service';
import { logDrillEvent } from '../events';
import { isLiveDrill } from '../live';
import { dedupeFindings } from './case';
import { hasLiveDrill, newProgress, stageDrills, type SkillProgress } from './engine';
import { loadProgress } from './store';
import type { CaseResultPayload } from '../case-result';

const rules = DRILLS_CONFIG.rules;
const DAY = 86_400_000;

// "1 of 2 passing sets. Last score: 74%. Need 80%." The streak that counts is
// the one for the stage the skill is climbing.
function progressTowardNext(p: SkillProgress) {
  const level1Only = !stageDrills(p.skill_id, isLiveDrill).construct;
  const streak = level1Only || p.stage === 'recognize' ? p.l1_streak : p.l2_streak;
  return { passing_sets: Math.min(streak, rules.mastery.consecutive_sets), of: rules.mastery.consecutive_sets, last_score: p.last_skill_score, bar: rules.mastery.passing_score };
}

export async function openPrescriptions(studentId: string) {
  const rows = await db.select().from(prescriptions)
    .where(and(eq(prescriptions.studentId, studentId), inArray(prescriptions.status, ['open', 'in_progress', 'paused'])))
    .orderBy(desc(prescriptions.priority), asc(prescriptions.createdAt));
  // Case prescriptions before drill ones at the same priority.
  const order = { case: 0, diagnostic: 1, questionnaire: 2, plan: 3, drill: 4 } as const;
  return rows
    .sort((a, b) => b.priority - a.priority || order[a.sourceType] - order[b.sourceType])
    .map(r => ({
      id: r.id, skill_id: r.skillId, skill_name: getSkill(r.skillId).name, drill_name: getDrill(r.drillId).name,
      reason: r.reasonText, status: r.status, priority: r.priority, source: r.sourceType,
    }));
}

export async function skillProfile(studentId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [progress, rx, attempts, cases, sets] = await Promise.all([
    loadProgress(db, studentId),
    openPrescriptions(studentId),
    db.select({ tags: drillAttempts.mistakeTags }).from(drillAttempts)
      .where(and(eq(drillAttempts.studentId, studentId), gte(drillAttempts.submittedAt, since))),
    db.select().from(caseResults).where(eq(caseResults.studentId, studentId)).orderBy(asc(caseResults.completedAt)),
    db.select().from(drillSets).where(and(eq(drillSets.studentId, studentId), eq(drillSets.status, 'completed')))
      .orderBy(desc(drillSets.completedAt)).limit(20),
  ]);
  const state = (id: string) => progress.get(id) ?? newProgress(id);

  const areas = DRILLS_CONFIG.taxonomy.areas.map(area => ({
    code: area.code, name: area.name,
    skills: DRILLS_CONFIG.taxonomy.skills.filter(s => s.area === area.code).map(s => {
      const p = state(s.id);
      return {
        id: s.id, name: s.name, live: hasLiveDrill(s.id, isLiveDrill), state: p.state, stage: p.stage,
        progress: progressTowardNext(p),
        builds_on: s.prerequisites.map(id => ({ id, name: getSkill(id).name, state: state(id).state })),
        transfer_due_at: p.state === 'practiced' ? p.transfer_due_at : null,
        next_review_at: p.state === 'mastered' || p.state === 'validated' ? p.next_review_at : null,
        paused_for: p.paused_for_prereq ? getSkill(p.paused_for_prereq).name : null,
      };
    }),
  }));

  // The top 3 mistakes from the last 30 days, from drills and cases (a case's
  // tag counts once).
  const counts = new Map<string, number>();
  for (const a of attempts) for (const t of a.tags) if (getMistakeTag(t)) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const c of cases.filter(c => c.completedAt >= since)) {
    for (const f of dedupeFindings(c.findings as CaseResultPayload['findings'])) counts.set(f.tag, (counts.get(f.tag) ?? 0) + 1);
  }
  const topMistakes = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([tag, count]) => ({
    tag, count, label: getMistakeTag(tag)!.label, skill_name: getSkill(getMistakeTag(tag)!.skill).name,
  }));

  // Rubric trends compare only cases in the same difficulty tier, from 2 cases.
  const byTier = new Map<number, typeof cases>();
  for (const c of cases) byTier.set(c.difficultyTier, [...(byTier.get(c.difficultyTier) ?? []), c]);
  const rubricTrends = [...byTier].filter(([, cs]) => cs.length >= 2).map(([tier, cs]) => ({
    tier, cases: cs.map(c => ({ case_id: c.caseId, completed_at: c.completedAt, ratings: c.rubricScores as Record<string, string> })),
  }));

  const history = [
    ...sets.map(s => ({ kind: 'set' as const, at: s.completedAt!, title: getDrill(s.drillId).name, score: s.setScore, passed: s.passed, transfer: s.isTransferCheck })),
    ...cases.map(c => ({ kind: 'case' as const, at: c.completedAt, title: c.caseId, score: null, passed: null, transfer: false })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);

  return { areas, prescriptions: rx, top_mistakes: topMistakes, rubric_trends: rubricTrends, history };
}

export async function dismissPrescription(studentId: string, id: string) {
  const [row] = await db.update(prescriptions).set({ status: 'dismissed', closedAt: new Date() })
    .where(and(eq(prescriptions.id, id), eq(prescriptions.studentId, studentId), inArray(prescriptions.status, ['open', 'in_progress', 'paused'])))
    .returning();
  if (!row) throw new DrillError('not_found', 404, 'That prescription is no longer open');
  await logDrillEvent(studentId, 'prescription_dismissed', {
    prescription_id: row.id, skill_id: row.skillId, drill_id: row.drillId, source_type: row.sourceType, priority: row.priority,
  });
  return { id: row.id, status: row.status };
}
