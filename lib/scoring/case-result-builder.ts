// Case results → drills, step 2 (Matt, 15 Nov; proposal §2.1): turns a graded
// report into the payload drills accepts (lib/drills/case-result.ts). Pure, so
// every rule is tested (tests/scoring/case-result-builder.test.ts):
//   - findings from code: the math checker's wrong figures, by error type, and
//     the stage record's "risk asked, none named";
//   - findings from the tagging step (skill-tags.ts): one per tagged "needs
//     work" point, only in the groups switched on (CASE_TAG_DRILL_GROUPS); the
//     rest are recorded with drill: false and give no prescription;
//   - severity: the tag's default; minor when the dimension was still rated
//     Adequate or Strong, or the figure was put right in the interview; major
//     when the finding's tag is the top improvement's;
//   - evidence: the point's first quote found in a candidate turn (the turn ids
//     come from there); none found, no finding;
//   - skills_observed: from the stage record and the math steps, never from AI.
// Nothing here calls a model or the database.
import { DRILLS_CONFIG, getMistakeTag } from '@/lib/drills/config';
import type { CaseResultPayload } from '@/lib/drills/case-result';
import { DIFFICULTY_TIER } from '@/lib/drills/program/next-case';
import type { TagGroup } from '@/lib/drills/case-to-drills';
import type { CaseType } from '@/lib/case-types';
import type { StageRecord, StageKey } from '@/lib/orchestrator/stage-evidence';
import type { RubricScores } from './judge';
import { RUBRIC_DIMENSION_KEYS, type RubricDimensionKey } from './rubric';
import { quoteAppearsIn } from './evidence-audit';
import type { CheckerFinding } from './checker-record';
import type { TagPoint, TagResult } from './skill-tags';

type Finding = CaseResultPayload['findings'][number];
type Turn = { turnIndex: number; text: string };

// One point as recorded in case_result_runs.points (and on the shadow review page).
export type RunPoint = {
  id: string;
  group: TagGroup;
  rating: string | null;
  point: string;
  quotes: string[];
  tag: string | null;
  reason: string;
  omitted?: true;
  // The tag may become a finding: its group is switched on.
  drill: boolean;
  finding: Finding | null;
  // Why a tag gave no finding (switched off, no quote found, the top improvement).
  note: string | null;
};
export type RunCheckerFinding = CheckerFinding & { tag: string | null; finding: Finding | null; note: string | null };

// The points the tagging step labels: "needs work" points with a verified
// quote, in dimensions that were rated (not "not assessed", no coverage
// caveat: the interviewer's gap, not the candidate's), and the top improvement.
export function casePoints(rubric: RubricScores): TagPoint[] {
  const out: TagPoint[] = [];
  for (const k of RUBRIC_DIMENSION_KEYS) {
    const d = rubric[k];
    if (!d || d.notAssessed || d.coverageCaveat) continue;
    d.needsWork.forEach((it, i) => {
      const quotes = it.quotes.filter(q => q.trim());
      if (quotes.length) out.push({ id: `${k}:${i}`, dimension: k, rating: d.rating, point: it.point, quotes });
    });
  }
  if (rubric.topFix.trim()) out.push({ id: 'topFix', dimension: null, rating: null, point: rubric.topFix, quotes: [] });
  return out;
}

// The math checker's error types (lib/orchestrator/math-checker.ts) → tags. A
// conceptual error is left to the tagging step: it could be several tags.
export function checkerTag(f: Pick<CheckerFinding, 'errorType' | 'candidateValue' | 'rightValue'>): string | null {
  switch (f.errorType) {
    case 'arithmetic': return powerOfTenOff(f.candidateValue, f.rightValue) ? 'M.zeros_error' : 'M.arithmetic_error';
    case 'wrong_base': return 'M.wrong_base';
    case 'unit': return 'M.unit_error';
    case 'wrong_period': return 'M.period_mismatch';
    case 'misquote': return 'M.wrong_data_point';
    default: return null;
  }
}

function powerOfTenOff(said: string, right: number | null): boolean {
  const n = Number(said.replace(/[^0-9.\-]/g, ''));
  if (!right || !Number.isFinite(n) || n === 0) return false;
  const exp = Math.log10(Math.abs(n / right));
  return Math.abs(exp) >= 0.95 && Math.abs(exp - Math.round(exp)) < 0.05;
}

const answered = (rec: StageRecord, k: StageKey) => rec[k]?.delivered && rec[k]?.outcome === 'answered';

// The skills a case gave the candidate a chance to show (proposal §2.1 c):
// each stage answered (not declined, not cut off at time-up), in a dimension
// that was rated. Skills not listed here can still get findings, but a case
// can't validate them.
export function skillsObserved(input: {
  rubric: RubricScores; stageRecord: StageRecord; candidateTurns: Turn[];
  mathSteps: { mentioned: boolean; unit?: string | string[] }[]; dataRequested: boolean;
}): string[] {
  const { rubric, stageRecord: rec } = input;
  const rated = (k: RubricDimensionKey) => Boolean(rubric[k]) && !rubric[k].notAssessed;
  const out = new Set<string>();
  const add = (k: RubricDimensionKey, ...skills: string[]) => { if (rated(k)) skills.forEach(s => out.add(s)); };
  if (answered(rec, 'structure')) add('structure', 'PS.mece', 'PS.case_specific', 'PS.depth');
  if (input.candidateTurns.length > 0) add('communication', 'CM.concise');
  const mentioned = input.mathSteps.filter(s => s.mentioned);
  if (mentioned.length) {
    add('quantitative', 'QN.setup', 'QN.arithmetic');
    const units = mentioned.flatMap(s => (Array.isArray(s.unit) ? s.unit : s.unit ? [s.unit] : []));
    if (units.some(u => u === 'percent' || u === 'points')) add('quantitative', 'QN.percentages');
  }
  if (input.dataRequested) add('pushback', 'CL.data_requests');
  if (answered(rec, 'exhibit')) add('dataExhibit', 'EX.takeaway', 'EX.extraction');
  if (answered(rec, 'brainstorm')) add('creativity', 'CR.volume', 'CR.structure');
  if (answered(rec, 'recommendation')) { add('synthesis', 'SY.answer_first', 'SY.evidence'); add('judgment', 'BJ.so_what'); }
  if (answered(rec, 'risk')) { add('synthesis', 'SY.complete'); add('judgment', 'BJ.risks'); }
  if (answered(rec, 'pressure_test')) add('pushback', 'CL.pushback');
  const known = new Set(DRILLS_CONFIG.taxonomy.skills.map(s => s.id));
  return [...out].filter(s => known.has(s));
}

// The candidate turns a quote appears in (the evidence audit's matching).
function turnsOf(quote: string, turns: Turn[]): number[] {
  return turns.filter(t => quoteAppearsIn(quote, t.text)).map(t => t.turnIndex);
}

const defaultSeverity = (tag: string) => getMistakeTag(tag)!.severity;

export type BuildInput = {
  sessionId: string;
  studentId: string;
  caseId: string;
  caseType: CaseType | null;
  difficulty: keyof typeof DIFFICULTY_TIER;
  completedAt: Date;
  partial: boolean;
  rubric: RubricScores;
  points: TagPoint[];
  tags: TagResult[];
  checker: CheckerFinding[];
  stageRecord: StageRecord;
  mathSteps: { mentioned: boolean; unit?: string | string[] }[];
  dataRequested: boolean;
  candidateTurns: Turn[];
  drillGroups: Set<TagGroup>;
};

export function buildCaseResult(input: BuildInput): { payload: CaseResultPayload; points: RunPoint[]; checker: RunCheckerFinding[] } {
  const tagById = new Map(input.tags.map(t => [t.id, t]));
  const topFix = tagById.get('topFix');
  const topFixTag = input.drillGroups.has('topFix') ? topFix?.tag ?? null : null;

  const points: RunPoint[] = input.points.map(p => {
    const t = tagById.get(p.id);
    const group = (p.dimension ?? 'topFix') as TagGroup;
    const drill = input.drillGroups.has(group);
    const base = { id: p.id, group, rating: p.rating, point: p.point, quotes: p.quotes, tag: t?.tag ?? null, reason: t?.reason ?? '', ...(t?.omitted && { omitted: true as const }), drill };
    if (!t?.tag) return { ...base, finding: null, note: null };
    if (!p.dimension) return { ...base, finding: null, note: 'the top improvement raises a matching finding to major; it is no finding itself' };
    if (!drill) return { ...base, finding: null, note: 'group switched off: shown on the report with no drill' };
    const quote = p.quotes.find(q => turnsOf(q, input.candidateTurns).length > 0);
    if (!quote) return { ...base, finding: null, note: 'no quote found in a candidate turn' };
    const minor = p.rating === 'meets_bar' || p.rating === 'strong';
    const severity = t.tag === topFixTag ? 'major' : minor ? 'minor' : defaultSeverity(t.tag);
    const tip = input.rubric[p.dimension].needsWork[Number(p.id.split(':')[1])]?.plain?.next;
    return { ...base, finding: { tag: t.tag, severity, turn_ids: turnsOf(quote, input.candidateTurns), evidence: quote, ...(tip && { tip }) }, note: null };
  });

  const checker: RunCheckerFinding[] = input.checker.map(c => {
    const tag = checkerTag(c);
    if (!tag) return { ...c, tag, finding: null, note: c.errorType === 'conceptual' ? 'conceptual: left to the tagging step' : 'no tag for this error type' };
    const turn = input.candidateTurns.find(t => t.turnIndex === c.turn && quoteAppearsIn(c.span, t.text));
    if (!turn) return { ...c, tag, finding: null, note: 'span not found in its candidate turn' };
    const severity = c.resolved ? 'minor' : tag === topFixTag ? 'major' : defaultSeverity(tag);
    return { ...c, tag, finding: { tag, severity, turn_ids: [c.turn], evidence: c.span }, note: null };
  });

  // The stage record: the risk was asked inside the recommendation question and the answer named none.
  const stage: Finding[] = [];
  const risk = input.stageRecord.risk;
  if (risk?.delivered && risk.noneNamed) {
    // The answer: the first candidate turn after the question.
    const recTurn = input.candidateTurns.find(t => t.turnIndex > (risk.deliveredAt ?? -1));
    if (recTurn) stage.push({ tag: 'M.missing_risk_or_next_step', severity: defaultSeverity('M.missing_risk_or_next_step'), turn_ids: [recTurn.turnIndex], evidence: recTurn.text.trim() });
  }

  const findings = [...checker.flatMap(c => (c.finding ? [c.finding] : [])), ...points.flatMap(p => (p.finding ? [p.finding] : [])), ...stage];
  const payload: CaseResultPayload = {
    case_attempt_id: input.sessionId,
    student_id: input.studentId,
    case_id: input.caseId,
    case_type: input.caseType,
    difficulty_tier: DIFFICULTY_TIER[input.difficulty],
    completed_at: input.completedAt.toISOString(),
    taxonomy_version: DRILLS_CONFIG.taxonomy.version,
    rubric_scores: Object.fromEntries(RUBRIC_DIMENSION_KEYS.flatMap(k => (input.rubric[k] && !input.rubric[k].notAssessed ? [[k, input.rubric[k].rating]] : []))),
    skills_observed: skillsObserved(input),
    findings,
    partial: input.partial,
  };
  return { payload, points, checker };
}
