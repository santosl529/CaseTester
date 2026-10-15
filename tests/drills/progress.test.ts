// D3 gate: scripted scenarios produce the exact state changes and
// prescriptions defined in docs/prd-drills.md ("Mastery and adaptive
// progression", "Skill tree", "Prescription engine").
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { CaseResultPayloadSchema, type CaseResultPayload } from '@/lib/drills/case-result';
import { applySet, newProgress, nextSetFor, type Context, type ProgressMap, type SetOutcome, type SkillProgress } from '@/lib/drills/progress/engine';
import { applyCase, caseReason, dedupeFindings } from '@/lib/drills/progress/case';

const DAY = 86_400_000;
const t0 = new Date('2026-10-12T12:00:00Z');
const at = (days: number): Context => ({ now: new Date(t0.getTime() + days * DAY) });

const progress = (...ps: Partial<SkillProgress>[]): ProgressMap =>
  new Map(ps.map(p => [p.skill_id!, { ...newProgress(p.skill_id!), ...p }]));

let n = 0;
function set(drill_id: string, tier: number, scores: Record<string, number>, extra: Partial<SetOutcome> = {}): SetOutcome {
  return {
    set_id: `set-${++n}`, drill_id, tier, kind: 'normal', target_skill: null, miss_tags: [], misses: 0,
    skill_scores: Object.fromEntries(Object.entries(scores).map(([k, score]) => [k, { score, count: 4 }])),
    ...extra,
  };
}

const fixture = (): CaseResultPayload => CaseResultPayloadSchema.parse(JSON.parse(fs.readFileSync(
  path.join(process.cwd(), 'tests/fixtures/drills/case-results/market-entry-t2.json'), 'utf-8')));
function caseWith(findings: [string, 'minor' | 'major', string?][], extra: Partial<CaseResultPayload> = {}): CaseResultPayload {
  return {
    ...fixture(), skills_observed: [], ...extra,
    findings: findings.map(([tag, severity, evidence]) => ({ tag, severity, turn_ids: [1], evidence: evidence ?? `quote for ${tag}` })),
  };
}

describe('case → prescriptions (PRD "Prescription rules")', () => {
  it('scores skills from the fixture case and quotes the student', () => {
    const u = applyCase(new Map(), fixture(), null, at(0));
    expect(u.prescriptions.map(p => [p.skill_id, p.priority])).toEqual([['QN.setup', 2], ['PS.case_specific', 1]]);
    expect(u.prescriptions[0].reason).toBe(
      'In your last case you said "so breakeven is two million divided by fifty dollars". That\'s a wrong formula; this set practices math setup.');
    // "Not started → Learning: first prescription."
    expect(u.transitions).toEqual([
      { skill_id: 'QN.setup', from: 'not_started', to: 'learning', reason: 'first prescription' },
      { skill_id: 'PS.case_specific', from: 'not_started', to: 'learning', reason: 'first prescription' },
    ]);
  });

  it('counts a tag once per case, major if any report is major', () => {
    const f = dedupeFindings(caseWith([['M.zeros_error', 'minor'], ['M.zeros_error', 'major'], ['M.zeros_error', 'minor']]).findings);
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('major');
    const u = applyCase(new Map(), caseWith([['M.zeros_error', 'minor'], ['M.zeros_error', 'major']]), null, at(0));
    expect(u.prescriptions).toMatchObject([{ skill_id: 'QN.magnitude', priority: 2, focus_tag: 'M.zeros_error' }]);
  });

  it('adds +2 for a skill flagged in the previous case and +1 for a regression from Mastered', () => {
    const prev = caseWith([['M.wrong_formula', 'minor']]);
    const now = caseWith([['M.wrong_formula', 'minor'], ['M.buried_recommendation', 'minor']]);
    const u = applyCase(progress({ skill_id: 'SY.answer_first', state: 'mastered' }), now, prev, at(0));
    expect(u.prescriptions.map(p => [p.skill_id, p.priority])).toEqual([['QN.setup', 3], ['SY.answer_first', 2]]);
    expect(u.regressions).toEqual(['SY.answer_first']);
  });

  it('takes at most 2 skills from one area; the third slot goes to the next area', () => {
    const c = caseWith([
      ['M.wrong_formula', 'major'], ['M.zeros_error', 'major'], ['M.wrong_base', 'major'],   // three QN skills
      ['M.buried_recommendation', 'minor'],
    ]);
    const u = applyCase(new Map(), c, null, at(0));
    expect(u.prescriptions.map(p => p.skill_id)).toEqual(['QN.setup', 'QN.magnitude', 'SY.answer_first']);   // ties → catalog order: QN-1 before QN-3
  });

  it('prescribes only 2 when every flagged skill is in one area', () => {
    const c = caseWith([['M.wrong_formula', 'major'], ['M.zeros_error', 'major'], ['M.wrong_base', 'major']]);
    expect(applyCase(new Map(), c, null, at(0)).prescriptions).toHaveLength(2);
  });

  it('breaks ties by lower state, then catalog order', () => {
    const c = caseWith([['M.buried_recommendation', 'minor'], ['M.missing_bucket', 'minor'], ['M.illogical_next_step', 'minor']]);
    // All priority 1 and Learning after the case: catalog order PS-1 (PS.mece), SY-1, CL-1.
    expect(applyCase(new Map(), c, null, at(0)).prescriptions.map(p => p.skill_id)).toEqual(['PS.mece', 'SY.answer_first', 'CL.next_step']);
    // PS.mece already Recognizes; the others are lower, so they go first.
    const u = applyCase(progress({ skill_id: 'PS.mece', state: 'recognizes' }), c, null, at(0));
    expect(u.prescriptions.map(p => p.skill_id)).toEqual(['SY.answer_first', 'CL.next_step', 'PS.mece']);
  });

  it('drops skills with no live drill (their findings stay in case feedback)', () => {
    const c = caseWith([['M.too_few_ideas', 'major'], ['M.missed_key_question', 'major'], ['M.wrong_formula', 'minor']]);
    expect(applyCase(new Map(), c, null, at(0)).prescriptions.map(p => p.skill_id)).toEqual(['QN.setup']);
  });

  it('shortens long quotes to their last 25 words', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
    expect(caseReason({ tag: 'M.zeros_error', severity: 'major', turn_ids: [1], evidence: long }))
      .toMatch(/^In your last case you said "…w15 w16 .* w39"\. That's a zeros error; this set practices zeros and units\.$/);
  });
});

describe('case → skill states (PRD "Updating skill state from cases")', () => {
  it('drops a flagged Practiced, Mastered or Validated skill to Recognizes, next stage Construct', () => {
    const before = progress(
      { skill_id: 'QN.setup', state: 'practiced', stage: 'construct', l2_streak: 2, transfer_due_at: t0 },
      { skill_id: 'SY.answer_first', state: 'validated', next_review_at: t0 },
    );
    const u = applyCase(before, caseWith([['M.wrong_formula', 'minor'], ['M.hedged_recommendation', 'minor']]), null, at(0));
    expect(u.transitions.map(t => [t.skill_id, t.from, t.to])).toEqual([
      ['QN.setup', 'practiced', 'recognizes'], ['SY.answer_first', 'validated', 'recognizes'],
    ]);
    expect(u.progress.get('QN.setup')).toMatchObject({ stage: 'construct', l2_streak: 0, transfer_due_at: null });
    expect(u.progress.get('SY.answer_first')!.next_review_at).toBeNull();
  });

  it("doesn't validate on a retake, but still drops a flagged skill", () => {
    const before = progress({ skill_id: 'PS.mece', state: 'mastered' }, { skill_id: 'QN.setup', state: 'mastered' });
    const u = applyCase(before, caseWith([['M.wrong_formula', 'minor']], { skills_observed: ['PS.mece', 'QN.setup'] }), null, at(0), true);
    expect(u.transitions.map(t => [t.skill_id, t.to])).toEqual([['QN.setup', 'recognizes']]);
  });

  it('validates a Mastered skill the case observed with no findings, and leaves other states alone', () => {
    const before = progress({ skill_id: 'PS.mece', state: 'mastered' }, { skill_id: 'QN.setup', state: 'practiced' });
    const u = applyCase(before, caseWith([], { skills_observed: ['PS.mece', 'QN.setup'] }), null, at(0));
    expect(u.transitions.map(t => [t.skill_id, t.to])).toEqual([['PS.mece', 'validated']]);
  });
});

describe('a student climbing one skill (PRD "Where a student starts")', () => {
  it('test-out at Construct tier 2, then Practiced after two passing sets, then a transfer check to Mastered', () => {
    let p = progress({ skill_id: 'QN.setup', state: 'learning' });
    const first = nextSetFor(p.get('QN.setup')!, {}, at(0));
    expect(first).toEqual({ drill_id: 'QN-4', stage: 'construct', tier: 2, kind: 'normal', test_out: true });

    let u = applySet(p, set('QN-4', 2, { 'QN.setup': 0.85 }, { target_skill: 'QN.setup' }), at(0));
    expect(u.transitions).toEqual([]);
    expect(u.progress.get('QN.setup')).toMatchObject({ state: 'learning', stage: 'construct', l2_streak: 1 });

    u = applySet(u.progress, set('QN-4', 3, { 'QN.setup': 0.9 }, { target_skill: 'QN.setup' }), at(1));
    expect(u.transitions).toEqual([{ skill_id: 'QN.setup', from: 'learning', to: 'practiced', reason: '2 Construct sets ≥ 80%' }]);
    expect(u.progress.get('QN.setup')!.transfer_due_at).toEqual(at(3).now);   // unlocks 2 days later

    // Not due yet: a normal Construct set at the student's tier.
    expect(nextSetFor(u.progress.get('QN.setup')!, { 'QN-4': 3 }, at(2))).toMatchObject({ drill_id: 'QN-4', kind: 'normal', tier: 3 });
    const transfer = nextSetFor(u.progress.get('QN.setup')!, { 'QN-4': 3 }, at(3));
    expect(transfer).toEqual({ drill_id: 'QN-4', stage: 'construct', tier: 2, kind: 'transfer', test_out: false });

    p = u.progress;
    u = applySet(p, set('QN-4', 2, { 'QN.setup': 0.8 }, { target_skill: 'QN.setup', kind: 'transfer' }), at(3));
    expect(u.transitions[0]).toEqual({ skill_id: 'QN.setup', from: 'practiced', to: 'mastered', reason: 'transfer check 80%' });
    expect(u.intents).toContainEqual({ type: 'complete', skill_id: 'QN.setup' });
    expect(u.progress.get('QN.setup')!.next_review_at).toEqual(at(17).now);
    // Credit down: QN.setup builds on QN.percentages (Not started) → Recognizes.
    expect(u.transitions[1]).toEqual({ skill_id: 'QN.percentages', from: 'not_started', to: 'recognizes', reason: 'credit down: QN.setup reached Mastered' });
  });

  it("only the drill's primary skills move: QN-4 can't make arithmetic Practiced", () => {
    let u = applySet(progress({ skill_id: 'QN.setup', state: 'learning' }), set('QN-4', 2, { 'QN.setup': 1, 'QN.arithmetic': 1, 'QN.magnitude': 1 }), at(0));
    u = applySet(u.progress, set('QN-4', 2, { 'QN.setup': 1, 'QN.arithmetic': 1, 'QN.magnitude': 1 }), at(0));
    expect(u.transitions.map(t => [t.skill_id, t.to])).toEqual([['QN.setup', 'practiced']]);
    expect(u.progress.get('QN.arithmetic')).toBeUndefined();
  });

  it('only tier 2+ sets count toward a state change', () => {
    let u = applySet(progress({ skill_id: 'QN.setup', state: 'learning' }), set('QN-4', 1, { 'QN.setup': 1 }), at(0));
    u = applySet(u.progress, set('QN-4', 1, { 'QN.setup': 1 }), at(0));
    expect(u.progress.get('QN.setup')).toMatchObject({ state: 'learning', l2_streak: 0 });
  });

  it('a failing tier 2 set breaks the streak', () => {
    let u = applySet(progress({ skill_id: 'QN.setup', state: 'learning' }), set('QN-4', 2, { 'QN.setup': 0.9 }), at(0));
    u = applySet(u.progress, set('QN-4', 2, { 'QN.setup': 0.7 }), at(0));
    u = applySet(u.progress, set('QN-4', 2, { 'QN.setup': 0.9 }), at(0));
    expect(u.progress.get('QN.setup')).toMatchObject({ state: 'learning', l2_streak: 1 });
  });

  it('after a Construct set: 50–79% stays at Construct (no Repair drill yet); below 50% goes back to Recognize', () => {
    const p = progress({ skill_id: 'QN.setup', state: 'learning', stage: 'construct' });
    expect(applySet(p, set('QN-4', 2, { 'QN.setup': 0.6 }), at(0)).progress.get('QN.setup')!.stage).toBe('construct');
    const low = applySet(p, set('QN-4', 2, { 'QN.setup': 0.4 }), at(0)).progress.get('QN.setup')!;
    expect(low.stage).toBe('recognize');
    expect(nextSetFor(low, {}, at(0))).toMatchObject({ drill_id: 'QN-1', stage: 'recognize', tier: 1 });
  });

  it('within 7 days of the interview, Recognize is never served', () => {
    const p = progress({ skill_id: 'QN.setup', state: 'learning', stage: 'construct' });
    const ctx = { ...at(0), interviewDaysOut: 5 };
    const low = applySet(p, set('QN-4', 2, { 'QN.setup': 0.3 }), ctx).progress.get('QN.setup')!;
    expect(low.stage).toBe('construct');
    expect(nextSetFor({ ...low, stage: 'recognize' }, {}, ctx)).toMatchObject({ drill_id: 'QN-4', stage: 'construct' });
  });

  it('skills with no Recognize drill go to Repair below 50% if they have one, else stay at Construct', () => {
    const p = progress({ skill_id: 'PS.depth', state: 'learning', stage: 'construct' });
    expect(applySet(p, set('PS-3', 2, { 'PS.depth': 0.2 }), at(0)).progress.get('PS.depth')!.stage).toBe('repair');
    const q = progress({ skill_id: 'HY.update', state: 'learning', stage: 'construct' });
    expect(applySet(q, set('HY-2', 2, { 'HY.update': 0.2 }), at(0)).progress.get('HY.update')!.stage).toBe('construct');
  });

  it('Recognize path: two Level 1 sets ≥ 80% at tier 2 → Recognizes, then Repair', () => {
    let u = applySet(progress({ skill_id: 'PS.mece', state: 'learning', stage: 'recognize' }), set('PS-1', 2, { 'PS.mece': 0.875 }), at(0));
    u = applySet(u.progress, set('PS-1', 3, { 'PS.mece': 0.875 }), at(0));
    expect(u.transitions.map(t => t.to)).toEqual(['recognizes']);
    expect(nextSetFor(u.progress.get('PS.mece')!, {}, at(0))).toMatchObject({ drill_id: 'PS-4', stage: 'repair' });
  });

  it('skills with no live Construct drill reach Practiced from Level 1, and transfer on Level 1 at tier 3', () => {
    let u = applySet(progress({ skill_id: 'CL.next_step', state: 'learning' }), set('CL-1', 2, { 'CL.next_step': 0.9 }), at(0));
    u = applySet(u.progress, set('CL-1', 2, { 'CL.next_step': 0.9 }), at(0));
    expect(u.transitions.map(t => t.to)).toEqual(['practiced']);
    expect(nextSetFor(u.progress.get('CL.next_step')!, {}, at(2))).toEqual({ drill_id: 'CL-1', stage: 'recognize', tier: 3, kind: 'transfer', test_out: false });
  });

  it('a newly prescribed skill with no Construct drill starts at Recognize tier 2', () => {
    expect(nextSetFor(newProgress('EX.traps'), {}, at(0))).toEqual({ drill_id: 'EX-2', stage: 'recognize', tier: 2, kind: 'normal', test_out: false });
  });
});

describe('transfer checks and spaced review (PRD "Transfer check", "Spaced review")', () => {
  const practiced = () => progress({ skill_id: 'QN.setup', state: 'practiced', stage: 'construct', transfer_due_at: t0 });
  const transfer = (score: number) => set('QN-4', 2, { 'QN.setup': score }, { target_skill: 'QN.setup', kind: 'transfer' });

  it('60–79% stays Practiced, puts one Construct set in the pool and unlocks another check 2 days later', () => {
    const u = applySet(practiced(), transfer(0.7), at(0));
    expect(u.transitions).toEqual([]);
    expect(u.progress.get('QN.setup')!.transfer_due_at).toEqual(at(2).now);
    expect(u.intents).toContainEqual(expect.objectContaining({ type: 'transfer_retry', skill_id: 'QN.setup' }));
  });

  it('below 60% drops to Recognizes', () => {
    const u = applySet(practiced(), transfer(0.5), at(0));
    expect(u.transitions.map(t => [t.from, t.to])).toEqual([['practiced', 'recognizes']]);
    expect(u.progress.get('QN.setup')!.transfer_due_at).toBeNull();
  });

  it('Sprint unlocks the transfer check as soon as a skill reaches Practiced', () => {
    const u = applySet(progress({ skill_id: 'QN.setup', state: 'learning', l2_streak: 1 }), set('QN-4', 2, { 'QN.setup': 0.9 }), { ...at(0), sprint: true });
    expect(u.progress.get('QN.setup')!.transfer_due_at).toEqual(t0);
  });

  it('a Mastered skill is reviewed after 14 days: ≥ 80% resets, 60–79% retries in 7 days, below 60% drops', () => {
    const mastered = progress({ skill_id: 'QN.setup', state: 'mastered', next_review_at: at(14).now });
    expect(nextSetFor(mastered.get('QN.setup')!, { 'QN-4': 3 }, at(13))!.kind).toBe('normal');
    expect(nextSetFor(mastered.get('QN.setup')!, { 'QN-4': 3 }, at(14))).toMatchObject({ drill_id: 'QN-4', kind: 'review', tier: 3 });
    const review = (s: number) => set('QN-4', 3, { 'QN.setup': s }, { target_skill: 'QN.setup', kind: 'review' });
    expect(applySet(mastered, review(0.9), at(14)).progress.get('QN.setup')!.next_review_at).toEqual(at(28).now);
    expect(applySet(mastered, review(0.7), at(14)).progress.get('QN.setup')!.next_review_at).toEqual(at(21).now);
    expect(applySet(mastered, review(0.5), at(14)).transitions.map(t => t.to)).toEqual(['recognizes']);
  });
});

describe('the stuck rule (PRD "Skill tree")', () => {
  it('two sets below 50% prescribe the missing prerequisite and pause the stuck skill until it reaches Practiced', () => {
    let u = applySet(progress({ skill_id: 'HY.form', state: 'learning', stage: 'construct' }), set('HY-2', 2, { 'HY.form': 0.4 }, { target_skill: 'HY.form' }), at(0));
    expect(u.intents.filter(i => i.type === 'prerequisite')).toEqual([]);
    u = applySet(u.progress, set('HY-1', 2, { 'HY.form': 0.3 }, { target_skill: 'HY.form' }), at(0));
    expect(u.intents).toContainEqual(expect.objectContaining({ type: 'prerequisite', skill_id: 'PS.case_specific', for_skill: 'HY.form' }));
    expect(u.progress.get('HY.form')!.paused_for_prereq).toBe('PS.case_specific');

    // Two passing PS-1 sets take PS.case_specific to Recognizes (not Practiced), so no resume yet...
    u = applySet(u.progress, set('PS-1', 2, { 'PS.case_specific': 0.9 }), at(1));
    u = applySet(u.progress, set('PS-1', 2, { 'PS.case_specific': 0.9 }), at(1));
    expect(u.intents.filter(i => i.type === 'resume')).toEqual([]);
    // ...the third prerequisite set resumes it.
    u = applySet(u.progress, set('PS-3', 2, { 'PS.case_specific': 0.6 }), at(2));
    expect(u.intents).toContainEqual({ type: 'resume', skill_id: 'HY.form' });
    expect(u.progress.get('HY.form')).toMatchObject({ paused_for_prereq: null, low_streak: 0 });
  });

  it('does not fire when every prerequisite is already Practiced', () => {
    const p = progress({ skill_id: 'HY.form', state: 'learning', low_streak: 1 }, { skill_id: 'PS.case_specific', state: 'practiced' });
    const u = applySet(p, set('HY-2', 2, { 'HY.form': 0.2 }), at(0));
    expect(u.intents.filter(i => i.type === 'prerequisite')).toEqual([]);
  });

  it('picks the prerequisite in the lowest state first', () => {
    const p = progress({ skill_id: 'QN.sizing_structure', state: 'learning', low_streak: 1 }, { skill_id: 'PS.mece', state: 'recognizes' });
    const u = applySet(p, set('QN-5', 2, { 'QN.sizing_structure': 0.2 }), at(0));
    expect(u.intents).toContainEqual(expect.objectContaining({ type: 'prerequisite', skill_id: 'QN.magnitude' }));
  });
});

describe('prescriptions inside drills (PRD "Prescriptions inside drills")', () => {
  it('a tag behind 40%+ of misses focuses that skill\'s next set; another skill\'s mistake gets a prescription', () => {
    const s = set('QN-3', 2, { 'QN.percentages': 0.6, 'QN.magnitude': 0.7 }, {
      target_skill: 'QN.percentages', misses: 4, miss_tags: ['M.zeros_error', 'M.zeros_error', 'M.wrong_base', 'M.arithmetic_error'],
    });
    const u = applySet(new Map(), s, at(0));
    expect(u.progress.get('QN.magnitude')!.next_focus_tag).toBe('M.zeros_error');
    expect(u.intents.filter(i => i.type === 'drill').map(i => i.skill_id)).toEqual(['QN.magnitude', 'QN.arithmetic']);
  });

  it('weighs other skills\' misses like a case: one major, or minor misses adding up to 2', () => {
    const rx = (tags: string[]) => applySet(new Map(), set('QN-3', 2, { 'QN.growth': 0.5 }, {
      target_skill: 'QN.growth', misses: tags.length, miss_tags: tags,
    }), at(0)).intents.filter(i => i.type === 'drill').map(i => i.skill_id);
    expect(rx(['M.percent_vs_points'])).toEqual([]);                                   // one minor: 1
    expect(rx(['M.percent_vs_points', 'M.percent_vs_points'])).toEqual(['QN.percentages']); // two minor: 2
    expect(rx(['M.wrong_base'])).toEqual(['QN.percentages']);                          // one major: 2
  });

  it('a plain retry (no target skill) creates no cross-skill prescriptions', () => {
    const s = set('QN-3', 2, { 'QN.percentages': 0.6 }, { misses: 1, miss_tags: ['M.zeros_error'] });
    expect(applySet(new Map(), s, at(0)).intents.filter(i => i.type === 'drill')).toEqual([]);
  });
});
