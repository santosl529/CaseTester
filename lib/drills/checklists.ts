// Builds D2 items from authored content (docs/drills-content-templates). The
// author writes the content: must-cover areas, hypothesis families, facts,
// drivers, driver cards. This module adds each drill's checklist, weights,
// red flags and inputs exactly as the PRD's drill specs define them, so every
// item of a drill is graded against the same rubric.
import type { ItemInput } from './item-schema';
import { getDrill } from './config';
import { formatEstimate } from './numeric';

type Tier = 1 | 2 | 3;
interface Base { item_id: string; tier: Tier; case_type: string }
const AUTHORSHIP = {
  author_of_record: 'Draft — awaiting human review', drafting_model: null,
  reviewed_by: null, reviewed_at: null, similarity_check: 'pending' as const,
};

function common(b: Base, drillId: string, level: 1 | 2, skills: string[]) {
  return {
    item_id: b.item_id, version: 1, drill_id: drillId, status: 'draft' as const, level, tier: b.tier,
    skills, case_type: b.case_type, exhibit: null, options: [], numeric: null,
    sources: [], authorship: AUTHORSHIP, generator: null, is_example: false, firm_style: null,
  };
}

const list = (xs: string[]) => xs.filter(Boolean).join('; ');

// ----------------------------------------------------------------- PS-3

export interface Ps3Content extends Base {
  prompt: string;
  model_framework: string;
  common_overlaps: string;
  must_cover: { area: string; what_counts: string; also_accept: string[] }[];
}

// PRD PS-3: 2–5 buckets, 1–4 sub-points each, at most 15 words per sub-point,
// 120 words in all.
export const PS3_LIMITS = { min_buckets: 2, max_buckets: 5, max_points: 4, max_point_words: 15, max_words: 120 };

export function ps3Item(c: Ps3Content): ItemInput {
  const n = c.must_cover.length;
  return {
    ...common(c, 'PS-3', 2, ['PS.mece', 'PS.case_specific', 'PS.depth']),
    prompt: c.prompt,
    input: { type: 'structured_buckets', max_buckets: PS3_LIMITS.max_buckets, max_words: PS3_LIMITS.max_words },
    checks: [
      // "Covers each must-cover area in the key (one check per area)": 50% split evenly.
      ...c.must_cover.map((a, i) => ({
        check_id: `cover_${i + 1}`,
        question: `Does the framework cover ${a.area}? This counts: ${a.what_counts}.${a.also_accept.length ? ` These also count: ${a.also_accept.join(', ')}.` : ''}`,
        weight: 0.5 / n, fail_tag: 'M.missing_bucket',
        feedback: `It doesn't cover ${a.area}: ${a.what_counts}.`,
      })),
      { check_id: 'no_overlap', question: 'Is every bucket distinct, with no two buckets substantially covering the same thing?',
        evidence: 'whole' as const, weight: 0.15, fail_tag: 'M.overlapping_buckets', feedback: 'Two buckets cover the same ground. Merge them and use the space for something missing.' },
      { check_id: 'case_specific', question: "Is every bucket specific to this client and objective, rather than a generic heading that would fit any case?",
        evidence: 'whole' as const, weight: 0.2, fail_tag: 'M.generic_framework', feedback: "Some buckets are generic. Tie each one to this client's question." },
      { check_id: 'concrete_subpoints', question: 'Does every bucket have at least one concrete sub-point: a specific thing to examine, not a restated heading?',
        evidence: 'whole' as const, weight: 0.15, fail_tag: 'M.shallow_structure', feedback: 'Some buckets have no concrete sub-points. Say what you would examine inside each one.' },
    ],
    red_flags: [
      // Only on non-profitability prompts: there a revenue/cost tree is generic.
      ...(c.case_type === 'profitability' ? [] : [{
        id: 'generic_profit_tree', definition: 'The top level of the framework is only revenue and costs (a generic profit tree).',
        cap: 0.4, tag: 'M.generic_framework', detection: 'ai' as const,
      }]),
      { id: 'fewer_than_two_buckets', definition: 'The framework has fewer than 2 buckets.', cap: 0.3, tag: 'M.shallow_structure', detection: 'code' as const },
    ],
    model_answer: c.model_framework,
    explanation: `A strong framework covers ${c.must_cover.map(a => a.area).join(', ')}.${c.common_overlaps ? ` Watch for overlap: ${c.common_overlaps}` : ''}`,
    extras: { must_cover: c.must_cover, common_overlaps: c.common_overlaps },
  };
}

// ----------------------------------------------------------------- HY-2

export type Hy2Action = 'keep' | 'revise' | 'drop';
export interface Hy2Content extends Base {
  opening_facts: string;
  new_fact: string;
  model_answer_stage1: string;
  model_answer_stage2: string;
  families: { family: string; description: string; action: Hy2Action; reason: string }[];
}

export const HY2_CHOICES = [
  { id: 'keep', text: 'Keep my hypothesis' },
  { id: 'revise', text: 'Revise it' },
  { id: 'drop', text: 'Drop it' },
];

// PRD HY-2: stage 1 is 60% (four checks at 15%), stage 2 is 40% (the update
// decision 25%, scored by code from the AI's family classification, and the
// reason 15%).
export function hy2Item(c: Hy2Content): ItemInput {
  return {
    ...common(c, 'HY-2', 2, ['HY.form', 'HY.update']),
    prompt: c.opening_facts,
    input: {
      type: 'free_text',
      steps: [
        { type: 'free_text', weight: 0.6, label: 'Your hypothesis, and why', max_words: 50, time_limits_s: getDrill('HY-2').stage_time_limits_s!.form },
        { type: 'single_choice', weight: 0.25, label: 'Given the new fact, what do you do with your hypothesis?', choices: HY2_CHOICES, time_limits_s: getDrill('HY-2').stage_time_limits_s!.update },
        { type: 'free_text', weight: 0.15, label: 'Why? If you revise it, give the revised hypothesis.', max_words: 30 },
      ],
    },
    checks: [
      { check_id: 'directional', step: 0, weight: 0.15, fail_tag: 'M.restates_facts',
        question: `Does the hypothesis name a specific likely cause, either one of the listed hypothesis families or another specific cause consistent with the facts?`,
        feedback: 'Name a specific likely cause, not a restatement of what happened.' },
      { check_id: 'evidence_based', step: 0, weight: 0.15, fail_tag: 'M.ignores_facts',
        question: 'Does the hypothesis use the facts given in the prompt?', feedback: 'Tie the hypothesis to the facts you were given.' },
      { check_id: 'testable', step: 0, weight: 0.15, fail_tag: 'M.untestable_hypothesis',
        question: 'Is it clear what data would confirm or reject the hypothesis?', feedback: 'Say what data would confirm or reject it.' },
      { check_id: 'tentative', step: 0, weight: 0.15, fail_tag: 'M.overconfident_hypothesis',
        question: 'Is the hypothesis framed as something to verify, while still committing to one direction?', feedback: 'Frame it as something to test, not a conclusion.' },
      { check_id: 'update_reason', step: 2, weight: 0.15, fail_tag: 'M.sticky_hypothesis',
        question: `Does the explanation for keeping, revising or dropping the hypothesis use the new fact ("${c.new_fact}")?`,
        feedback: 'Use the new fact to explain your decision.' },
    ],
    red_flags: [
      { id: 'restates_facts', step: 0, definition: 'Stage 1 only restates the facts and names no cause.', cap: 0.3, tag: 'M.restates_facts', detection: 'ai' },
      { id: 'three_plus_causes', step: 0, definition: 'Stage 1 lists three or more causes without picking one.', cap: 0.5, tag: 'M.shotgun_hypotheses', detection: 'ai' },
    ],
    model_answer: `Stage 1: ${c.model_answer_stage1}\nStage 2: ${c.model_answer_stage2}`,
    explanation: `The new fact: ${c.new_fact} ${c.families.map(f => `${f.family}: ${f.action} (${f.reason}).`).join(' ')}`,
    extras: { families: c.families, new_fact: c.new_fact },
  };
}

// The update decision (PRD): the key gives the right action for each family;
// for a hypothesis in no family ("other"), revise and drop are both right.
export function hy2DecisionTag(families: Hy2Content['families'], family: string | null, chose: string): string | null {
  const known = families.find(f => f.family === family);
  const right: string[] = known ? [known.action] : ['revise', 'drop'];
  if (right.includes(chose)) return null;
  // Kept a hypothesis the fact contradicts, or changed one it supports.
  return chose === 'keep' ? 'M.sticky_hypothesis' : right.includes('keep') ? 'M.dropped_supported_hypothesis' : 'M.sticky_hypothesis';
}

// ----------------------------------------------------------------- SY-2

export interface Sy2Content extends Base {
  client_question: string;
  acceptable_recommendations: string;
  key_risks: string;
  next_steps: string;
  model_answer: string;
  facts: { fact: string; relevant: boolean }[];
}

export function sy2Item(c: Sy2Content): ItemInput {
  return {
    ...common(c, 'SY-2', 2, ['SY.answer_first', 'SY.evidence', 'SY.complete']),
    prompt: `The client asks: "${c.client_question}"\n\nFact sheet:\n${c.facts.map(f => `- ${f.fact}`).join('\n')}\n\nGive your recommendation.`,
    input: { type: 'free_text', max_words: 120 },
    checks: [
      { check_id: 'recommendation_first', question: 'Does the first sentence state a clear recommendation?', weight: 0.2,
        fail_tag: 'M.buried_recommendation', feedback: 'Lead with the recommendation in your first sentence.' },
      { check_id: 'two_to_three_reasons', question: 'Does the answer give two or three supporting reasons?', weight: 0.15,
        fail_tag: 'M.unsupported_recommendation', feedback: 'Back the recommendation with two or three reasons.' },
      // PRD: "code pre-check: at least one fact-sheet number appears". Settled by code.
      { check_id: 'cites_numbers', question: 'Do the reasons cite numbers from the fact sheet?', weight: 0.15, detection: 'code',
        fail_tag: 'M.unsupported_recommendation', feedback: 'Use the numbers from the fact sheet to support your reasons.' },
      { check_id: 'leaves_out_irrelevant', question: `Does the answer leave out the irrelevant facts (${list(c.facts.filter(f => !f.relevant).map(f => f.fact))})?`,
        evidence: 'whole' as const, weight: 0.15, fail_tag: 'M.irrelevant_facts', feedback: "Leave out facts that don't bear on the decision." },
      { check_id: 'consistent_with_facts', question: 'Are all the supporting points consistent with the fact sheet?', evidence: 'whole' as const, weight: 0.15,
        fail_tag: 'M.unsupported_recommendation', feedback: 'Some points go beyond or against the fact sheet.' },
      { check_id: 'includes_risk', question: 'Does the answer name a risk?', weight: 0.1,
        fail_tag: 'M.missing_risk_or_next_step', feedback: 'Name the main risk to your recommendation.' },
      { check_id: 'includes_next_step', question: 'Does the answer give a next step?', weight: 0.1,
        fail_tag: 'M.missing_risk_or_next_step', feedback: 'End with a concrete next step.' },
    ],
    red_flags: [
      { id: 'no_clear_position', definition: 'The answer takes no clear position, for example "it depends".', cap: 0.4, tag: 'M.hedged_recommendation', detection: 'ai' },
      { id: 'contradicts_facts', definition: 'The answer makes a claim the fact sheet contradicts.', cap: 0.5, tag: 'M.unsupported_recommendation', detection: 'ai' },
    ],
    model_answer: c.model_answer,
    explanation: `Acceptable recommendation: ${c.acceptable_recommendations}. Key risks: ${c.key_risks}. Next steps: ${c.next_steps}.`,
    extras: { facts: c.facts, acceptable_recommendations: c.acceptable_recommendations },
  };
}

// ----------------------------------------------------------------- CL-3

export interface Cl3Content extends Base {
  situation: string;
  best_starting_point: string;
  reason_to_start_there: string;
  specific_request_examples: string;
  vague_request_examples: string;
  model_answer: string;
  drivers: { driver: string; what_counts: string }[];
}

export function cl3Item(c: Cl3Content): ItemInput {
  const n = c.drivers.length;
  return {
    ...common(c, 'CL-3', 2, ['CL.data_requests']),
    prompt: `${c.situation}\n\nWhat information would you ask for, and where would you start?`,
    input: { type: 'free_text', max_words: 60 },
    checks: [
      { check_id: 'breaks_into_drivers', question: 'Does the answer break the metric into its drivers?', weight: 0.25,
        fail_tag: 'M.laundry_list', feedback: 'Break the metric into its drivers before asking for data.' },
      ...c.drivers.map((d, i) => ({
        check_id: `driver_${i + 1}`, question: `Does the answer cover ${d.driver} (${d.what_counts})?`,
        weight: 0.25 / n, fail_tag: 'M.vague_data_request', feedback: `It doesn't cover ${d.driver}.`,
      })),
      { check_id: 'states_where_to_start', question: 'Does the answer say where to start?', weight: 0.15,
        fail_tag: 'M.laundry_list', feedback: 'Say where you would start.' },
      { check_id: 'reason_for_start', question: 'Does the answer give a reason for starting there?', weight: 0.1,
        fail_tag: 'M.laundry_list', feedback: 'Give a reason for where you start.' },
      { check_id: 'specific_requests', question: 'Are the data requests specific, each naming a metric plus a cut or a time period?', weight: 0.25,
        fail_tag: 'M.vague_data_request', feedback: `Make requests specific, like: ${c.specific_request_examples}.` },
    ],
    red_flags: [
      { id: 'solution_before_diagnosis', definition: 'The answer proposes solutions before diagnosing the problem.', cap: 0.5, tag: 'M.premature_solution', detection: 'ai' },
      { id: 'six_plus_unstructured_requests', definition: 'The answer lists six or more data requests with no structure.', cap: 0.5, tag: 'M.laundry_list', detection: 'ai' },
    ],
    model_answer: c.model_answer,
    explanation: `Drivers: ${c.drivers.map(d => d.driver).join(', ')}. Start with ${c.best_starting_point}: ${c.reason_to_start_there}. Specific: ${c.specific_request_examples}. Vague: ${c.vague_request_examples}.`,
    extras: { drivers: c.drivers, best_starting_point: c.best_starting_point },
  };
}

// ----------------------------------------------------------------- QN-5

export interface Qn5Content extends Base {
  prompt: string;
  accepted_driver_sets: number[][];
  total_low: number;
  total_high: number;
  total_source: string;
  walkthrough: string;
  cards: { card: number; text: string; role: 'driver' | 'distractor'; low: number | null; high: number | null; unit: string; source: string }[];
}

export const QN5_SANITY_CHOICES = [
  { id: 'reasonable', text: 'Seems reasonable' },
  { id: 'too_high', text: 'Seems too high' },
  { id: 'too_low', text: 'Seems too low' },
];

// PRD QN-5, scored by code: structure 35%, assumptions 30%, calculation 25%,
// sanity check 10%.
export function qn5Item(c: Qn5Content): ItemInput {
  const first = c.accepted_driver_sets[0];
  const mid = (card: number) => {
    const k = c.cards.find(x => x.card === card)!;
    return ((k.low ?? 0) + (k.high ?? 0)) / 2;
  };
  return {
    ...common(c, 'QN-5', 2, ['QN.sizing_structure', 'QN.assumptions', 'QN.arithmetic', 'QN.sanity_check']),
    prompt: c.prompt,
    input: {
      type: 'multi_select',
      steps: [
        { type: 'multi_select', weight: 0.35, label: 'Pick the drivers that build the estimate' },
        { type: 'numeric_set', weight: 0.3, label: 'Estimate each driver' },
        { type: 'numeric', weight: 0.25, label: 'Multiply them out: your estimate of the total' },
        { type: 'single_choice', weight: 0.1, label: 'Does your total seem reasonable?', choices: QN5_SANITY_CHOICES },
      ],
    },
    options: c.cards.map(k => k.role === 'driver'
      ? { id: String(k.card), text: k.text, correct: true, feedback: `A driver: ${k.source}` }
      : { id: String(k.card), text: k.text, correct: false, tag: 'M.double_counting', feedback: k.source || "This card doesn't belong in the estimate." }),
    // The key's central estimate, for display. Step 3 is checked against the
    // student's own assumptions, not this.
    numeric: {
      answer: first.reduce((p, card) => p * mid(card), 1),
      tolerance_type: 'relative', tolerance_value: 0.02, percent_format: 'none', trap_values: [],
    },
    checks: [], red_flags: [],
    model_answer: c.walkthrough,
    explanation: `${c.walkthrough.replace(/[^.!?]$/, '$&.')} A believable total is ${formatEstimate(c.total_low)}–${formatEstimate(c.total_high)} (${c.total_source}).`,
    extras: {
      accepted_sets: c.accepted_driver_sets.map(s => s.map(String)),
      ranges: Object.fromEntries(c.cards.filter(k => k.role === 'driver').map(k => [String(k.card), { low: k.low, high: k.high, unit: k.unit, source: k.source }])),
      benchmark: { low: c.total_low, high: c.total_high, source: c.total_source },
      step_skills: [['QN.sizing_structure'], ['QN.assumptions'], ['QN.arithmetic'], ['QN.sanity_check']],
    },
  };
}
