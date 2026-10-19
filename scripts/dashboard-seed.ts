// Six weeks of realistic history for one test student, backdated, so Your
// progress has something to show (drills:smoke:dashboard and the a11y audit's
// screenshots): sets on five drills improving over time, a tier-up on PS-1
// (with its dip), written CL-3 answers, state moves including one slip and a
// diagnostic placement, three open prescriptions, and full cases: two
// different tier 2+ cases that meet the bar (two at tier 2, for the rubric
// comparison), plus a retake that doesn't
// (retakes don't count). Written straight to the tables, replacing the
// student's skill states and state history; nothing is graded.
// cleanupDashboardSeed removes it.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { caseResults, drillAttempts, drillItems, drillSets, prescriptions, skillStateEvents, skillStates } from '@/db/schema';
import { DRILLS_CONFIG, TAXONOMY_VERSION, getDrill } from '@/lib/drills/config';
import { ItemSchema, type Item } from '@/lib/drills/item-schema';
import type { SkillStateName } from '@/lib/drills/progress/engine';

const DAY = 86_400_000;
const tags = (skill: string) => DRILLS_CONFIG.taxonomy.mistake_tags.filter(t => t.skill === skill).map(t => t.id);

// drill, stage, its skills, and the week (6 = oldest) PS-1 moves to tier 2.
const DRILLS = [
  { id: 'PS-1', stage: 'recognize', skills: ['PS.mece', 'PS.case_specific'] },
  { id: 'HY-1', stage: 'recognize', skills: ['HY.form'] },
  { id: 'EX-1', stage: 'recognize', skills: ['EX.takeaway'] },
  { id: 'SY-1', stage: 'recognize', skills: ['SY.answer_first', 'SY.evidence'] },
  { id: 'CL-3', stage: 'construct', skills: ['CL.data_requests'] },
] as const;

const CL3_ANSWERS = [
  "I'd look at revenue and costs, then see what changed.",
  "I'd ask for cost data and sales data to understand the problem.",
  "I'd split margin into price and cost. I'd start with cost per order by month for the last two years, since costs rose fastest.",
];

// Score of the k-th set of a drill (0 = oldest): improving, with a dip after PS-1's tier-up.
function rightCount(drill: string, k: number, size: number): number {
  const base = [0.5, 0.5, 0.75, 0.75, 0.75, 1, 0.75, 1, 1, 1, 1, 1][k] ?? 1;
  const dip = drill === 'PS-1' && (k === 6 || k === 7) ? -0.25 : 0;
  return Math.max(0, Math.min(size, Math.round((base + dip) * size)));
}

export async function seedDashboardHistory(studentId: string, now = new Date()) {
  const at = (days: number, hour = 15) => new Date(now.getTime() - days * DAY + (hour - 12) * 3_600_000);
  for (const d of DRILLS) {
    const rows = await db.select().from(drillItems).where(and(eq(drillItems.drillId, d.id), eq(drillItems.status, 'live'))).limit(24);
    const items = rows.map(r => ({ row: r, item: ItemSchema.parse(r.payload) as Item }));
    const drill = getDrill(d.id);
    // Two sets a week for six weeks, oldest first.
    for (let k = 0; k < 12; k++) {
      const daysAgo = 42 - k * 3.5 - 1;
      const tier = d.id === 'PS-1' && k >= 6 ? 2 : 1;
      const size = 4;
      const picked = items.slice((k * size) % Math.max(1, items.length - size), (k * size) % Math.max(1, items.length - size) + size);
      const right = rightCount(d.id, k, size);
      const score = right / size;
      const [set] = await db.insert(drillSets).values({
        studentId, drillId: d.id, level: drill.level, stage: d.stage, tier, size, source: 'specific', status: 'completed',
        itemPlan: picked.map(p => ({ kind: 'authored', item_id: p.row.itemId, version: p.row.version })), currentPosition: size,
        setScore: score, passed: score >= drill.pass_bar, skillScores: Object.fromEntries(d.skills.map(s => [s, { score, count: size }])),
        taxonomyVersion: TAXONOMY_VERSION, startedAt: at(daysAgo, 14), completedAt: at(daysAgo, 15), feedbackMode: k % 2 ? 'end' : 'immediate',
      }).returning({ id: drillSets.id });
      const limit = (drill.time_limits_s?.[tier - 1] ?? 90) * 1000;
      await db.insert(drillAttempts).values(picked.map((p, i) => {
        const ok = i < right;
        const written = d.id === 'CL-3';
        const wrong = p.item.options.find(o => !o.correct);
        const response = written
          ? { steps: [{ type: 'text', value: CL3_ANSWERS[ok ? 2 : k % 2] }], skip: false }
          : { steps: [{ type: 'choice', option_id: ok ? p.item.options.find(o => o.correct)!.id : wrong!.id }], skip: false };
        const mistake = ok ? [] : written ? [tags('CL.data_requests')[k % Math.max(1, tags('CL.data_requests').length)]] : [wrong?.tag ?? tags(d.skills[0])[0]];
        return {
          setId: set.id, studentId, position: i, idempotencyKey: `seed-${set.id}-${i}`, itemId: p.row.itemId, itemVersion: p.row.version,
          response, servedAt: at(daysAgo, 14), timeMs: Math.round(limit * (0.75 - k * 0.03)), timeLimitMs: limit, timedOut: false, skipped: false,
          score: ok ? 1 : written ? 0.5 : 0, stepScores: [], mistakeTags: mistake.filter(Boolean), gradingStatus: written ? 'graded' as const : 'not_needed' as const,
          submittedAt: at(daysAgo, 14 + i / 10),
        };
      }));
    }
  }

  // State moves: placements, climbs, and one slip. They replace the test
  // student's own (a questionnaire's placements today would outrank them).
  await db.delete(skillStateEvents).where(eq(skillStateEvents.studentId, studentId));
  await db.delete(skillStates).where(eq(skillStates.studentId, studentId));
  const moves: [string, SkillStateName, SkillStateName, number, string][] = [
    ['PS.mece', 'not_started', 'learning', 42, 'diagnostic placement'], ['PS.case_specific', 'not_started', 'learning', 42, 'diagnostic placement'],
    ['HY.form', 'not_started', 'learning', 42, 'diagnostic placement'], ['EX.takeaway', 'not_started', 'learning', 42, 'diagnostic placement'],
    ['SY.answer_first', 'not_started', 'learning', 42, 'diagnostic placement'], ['SY.evidence', 'not_started', 'learning', 42, 'diagnostic placement'],
    ['CL.data_requests', 'not_started', 'learning', 42, 'diagnostic placement'], ['QN.arithmetic', 'not_started', 'practiced', 42, 'diagnostic placement'],
    ['PS.mece', 'learning', 'recognizes', 30, 'passing sets'], ['SY.answer_first', 'learning', 'recognizes', 27, 'passing sets'],
    ['HY.form', 'learning', 'recognizes', 22, 'passing sets'], ['SY.evidence', 'learning', 'recognizes', 20, 'passing sets'],
    ['PS.mece', 'recognizes', 'practiced', 16, 'passing sets'], ['QN.arithmetic', 'practiced', 'mastered', 14, 'transfer check passed'],
    ['EX.takeaway', 'learning', 'recognizes', 12, 'passing sets'], ['SY.answer_first', 'recognizes', 'practiced', 9, 'passing sets'],
    ['SY.evidence', 'recognizes', 'learning', 6, 'low scores'], ['PS.case_specific', 'learning', 'recognizes', 5, 'passing sets'],
    ['HY.form', 'recognizes', 'practiced', 4, 'passing sets'], ['PS.mece', 'practiced', 'mastered', 3, 'transfer check passed'],
    ['SY.answer_first', 'practiced', 'mastered', 2, 'transfer check passed'],
  ];
  await db.insert(skillStateEvents).values(moves.map(([skillId, fromState, toState, days, reason]) => ({
    studentId, skillId, fromState, toState, reason, sourceType: 'set' as const, sourceId: 'seed', taxonomyVersion: TAXONOMY_VERSION, createdAt: at(days),
  })));
  const final = new Map<string, SkillStateName>();
  for (const [s, , to] of moves) final.set(s, to);
  const last = (s: string) => ({ 'PS.mece': 0.9, 'SY.answer_first': 1, 'HY.form': 0.85, 'QN.arithmetic': 0.95, 'EX.takeaway': 0.75, 'PS.case_specific': 0.75, 'SY.evidence': 0.5, 'CL.data_requests': 0.6 } as Record<string, number>)[s] ?? null;
  await db.insert(skillStates).values([...final].map(([skillId, state]) => ({
    studentId, skillId, state, lastSkillScore: last(skillId), lastPracticedAt: at(1), stage: skillId === 'CL.data_requests' ? 'construct' : 'recognize',
    l1PassingStreak: state === 'recognizes' ? 1 : 0, transferDueAt: state === 'practiced' ? at(-2) : null, taxonomyVersion: TAXONOMY_VERSION,
  })));

  // As the engine does at Mastered: the skill's prescriptions close (the
  // student's own, e.g. a questionnaire's, would otherwise stay open).
  const mastered = [...final].filter(([, st]) => st === 'mastered' || st === 'validated').map(([id]) => id);
  if (mastered.length) {
    await db.update(prescriptions).set({ status: 'completed', closedAt: new Date() })
      .where(and(eq(prescriptions.studentId, studentId), inArray(prescriptions.skillId, mastered), inArray(prescriptions.status, ['open', 'in_progress', 'paused'])));
  }

  // Open prescriptions, in different orders of priority and source.
  const rx = [
    { skillId: 'CL.data_requests', drillId: 'CL-3', priority: 3, sourceType: 'case' as const, reasonText: 'In your case you asked for "all the cost data": name a measure and a cut.' },
    { skillId: 'EX.takeaway', drillId: 'EX-1', priority: 2, sourceType: 'drill' as const, reasonText: 'You described charts instead of saying what they mean for the client in 3 of your last 6 answers.' },
    { skillId: 'SY.evidence', drillId: 'SY-1', priority: 1, sourceType: 'drill' as const, reasonText: 'Your recommendations dropped to 50%: practice backing them with the deciding numbers.' },
  ];
  await db.insert(prescriptions).values(rx.map(r => ({ ...r, studentId, level: getDrill(r.drillId).level, tier: 1, sourceId: 'seed', taxonomyVersion: TAXONOMY_VERSION })));

  // Full cases: three different tier 2+ cases that meet the bar, then a retake that doesn't.
  const requestTag = tags('CL.data_requests')[0];
  const cases = [
    { id: 'prof-001', tier: 2, days: 20, ratings: { structure: 'strong', quantitative: 'meets_bar', dataExhibit: 'strong', judgment: 'meets_bar', synthesis: 'strong', communication: 'strong' } },
    { id: 'prof-002', tier: 2, days: 12, ratings: { structure: 'strong', quantitative: 'strong', dataExhibit: 'meets_bar', judgment: 'meets_bar', synthesis: 'strong', communication: 'meets_bar' } },
    { id: 'pricing-001', tier: 3, days: 6, ratings: { structure: 'strong', quantitative: 'strong', dataExhibit: 'meets_bar', judgment: 'strong', synthesis: 'meets_bar', communication: 'strong' } },
    { id: 'prof-001', tier: 2, days: 1, ratings: { structure: 'meets_bar', quantitative: 'needs_work', dataExhibit: 'meets_bar', judgment: 'meets_bar', synthesis: 'meets_bar', communication: 'strong' } },
  ];
  await db.insert(caseResults).values(cases.map((c, i) => ({
    caseAttemptId: `seed-${studentId}-${i}`, studentId, caseId: c.id, difficultyTier: c.tier, rubricScores: c.ratings, skillsObserved: ['CL.data_requests'],
    findings: i === 0 ? [{ tag: requestTag, severity: 'major', turn_ids: [4], evidence: 'Can I get all the cost data you have?' }] : [],
    taxonomyVersion: TAXONOMY_VERSION, completedAt: at(c.days),
  })));
}

export async function cleanupDashboardSeed(studentId: string) {
  await db.delete(caseResults).where(eq(caseResults.studentId, studentId));
  await db.delete(prescriptions).where(eq(prescriptions.studentId, studentId));
  const sets = await db.select({ id: drillSets.id }).from(drillSets).where(eq(drillSets.studentId, studentId));
  if (sets.length) {
    await db.delete(drillAttempts).where(inArray(drillAttempts.setId, sets.map(s => s.id)));
  }
}
