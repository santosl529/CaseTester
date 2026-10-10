// Converts the D2 content spreadsheets (docs/drills-content-templates) into
// item JSON and golden answers. Pure: the script in
// scripts/import-drill-content.ts does the file reading and writing.
import { z } from 'zod';
import { cl3Item, hy2Item, ps3Item, qn5Item, sy2Item, type Cl3Content, type Hy2Content, type Ps3Content, type Qn5Content, type Sy2Content, QN5_CARD_ROLES, type Qn5CardRole } from './checklists';
import { ItemSchema, type Item } from './item-schema';
import type { StepResponse } from './sets/scoring';

// ------------------------------------------------------------------ CSV

// RFC 4180: quoted fields may hold commas, newlines and "" for a quote.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!header) return [];
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// ------------------------------------------------------------- helpers

export interface ImportOptions { includeExamples?: boolean }
export interface ImportProblem { file: string; row: string; message: string }

const isExample = (id: string) => id.startsWith('EXAMPLE-');
const idOf = (id: string) => (isExample(id) ? id.replace(/^EXAMPLE-/, 'example-') : id);
const keep = (o: ImportOptions) => (r: Record<string, string>) => (r.item_id || r.answer_id) && (o.includeExamples || !isExample(r.item_id ?? r.answer_id));
const yes = (v: string) => /^(y|yes|true|1)$/i.test(v.trim());
const splitList = (v: string) => v.split(/[;|]/).map(s => s.trim()).filter(Boolean);
const tierOf = (v: string) => {
  const t = Number(v);
  if (![1, 2, 3].includes(t)) throw new Error(`tier must be 1, 2 or 3, got "${v}"`);
  return t as 1 | 2 | 3;
};
const num = (v: string, what: string) => {
  const n = Number(v.replace(/[,$\s]/g, ''));
  if (!Number.isFinite(n)) throw new Error(`${what} must be a number, got "${v}"`);
  return n;
};

export type Tables = Record<string, Record<string, string>[]>;

export interface ImportResult {
  items: Item[];
  golden: GoldenAnswer[];
  problems: ImportProblem[];
}

// ------------------------------------------------------------- golden

export const GoldenAnswerSchema = z.object({
  answer_id: z.string(),
  item_id: z.string(),
  drill_id: z.string(),
  answer_type: z.enum(['normal', 'borderline', 'short', 'off_topic', 'injection']),
  responses: z.array(z.unknown()),         // StepResponse per step
  labels: z.record(z.string(), z.boolean()),   // check_id → passes
  red_flags: z.record(z.string(), z.boolean()), // red flag id → present
  family: z.string().nullable(),           // HY-2: hypothesis family or "other"
  notes: z.string(),
});
export type GoldenAnswer = z.infer<typeof GoldenAnswerSchema> & { responses: StepResponse[] };

// "Bucket: point; point" per line → structured buckets.
export function parseFramework(text: string): StepResponse {
  const buckets = text.split(/\n+/).map(l => l.trim()).filter(Boolean).map(line => {
    const colon = line.indexOf(':');
    const title = colon === -1 ? line : line.slice(0, colon);
    const rest = colon === -1 ? '' : line.slice(colon + 1);
    return { title: title.trim(), points: rest.split(';').map(p => p.trim()).filter(Boolean) };
  });
  return { type: 'buckets', buckets };
}

const answerType = (v: string) => {
  const t = (v || 'normal').toLowerCase().replace(/[\s-]/g, '_');
  return (['normal', 'borderline', 'short', 'off_topic', 'injection'].includes(t) ? t : 'normal') as GoldenAnswer['answer_type'];
};

// ---------------------------------------------------------------- import

export function importContent(t: Tables, o: ImportOptions = {}): ImportResult {
  const items: Item[] = [];
  const golden: GoldenAnswer[] = [];
  const problems: ImportProblem[] = [];
  const rowsFor = (name: string, itemId: string) => (t[name] ?? []).filter(r => r.item_id === itemId);

  const build = (file: string, rows: Record<string, string>[], make: (r: Record<string, string>) => unknown) => {
    for (const r of rows.filter(keep(o))) {
      try {
        const result = ItemSchema.safeParse(make(r));
        if (!result.success) problems.push({ file, row: r.item_id, message: z.prettifyError(result.error) });
        else items.push(result.data);
      } catch (e) {
        problems.push({ file, row: r.item_id, message: (e as Error).message });
      }
    }
  };

  build('ps3-questions.csv', t['ps3-questions'] ?? [], r => {
    const areas = rowsFor('ps3-must-cover', r.item_id);
    if (areas.length < 4 || areas.length > 6) throw new Error(`needs 4–6 must-cover areas in ps3-must-cover.csv, has ${areas.length}`);
    return ps3Item({
      item_id: idOf(r.item_id), tier: tierOf(r.tier), case_type: r.case_type, prompt: r.prompt,
      model_framework: r.model_framework, common_overlaps: r.common_overlaps,
      must_cover: areas.map(a => ({ area: a.area, what_counts: a.what_counts, also_accept: splitList(a.also_accept) })),
    } satisfies Ps3Content);
  });

  build('hy2-questions.csv', t['hy2-questions'] ?? [], r => {
    const families = rowsFor('hy2-families', r.item_id);
    if (families.length < 3 || families.length > 4) throw new Error(`needs 3–4 hypothesis families in hy2-families.csv, has ${families.length}`);
    const actions = families.map(f => f.correct_action_after_new_fact.toLowerCase());
    for (const a of actions) if (!['keep', 'revise', 'drop'].includes(a)) throw new Error(`correct_action_after_new_fact must be keep, revise or drop, got "${a}"`);
    if (!actions.includes('keep') || !actions.some(a => a !== 'keep')) {
      throw new Error('the new fact must support at least one family (keep) and contradict at least one (revise or drop)');
    }
    return hy2Item({
      item_id: idOf(r.item_id), tier: tierOf(r.tier), case_type: r.case_type, opening_facts: r.opening_facts,
      new_fact: r.new_fact, model_answer_stage1: r.model_answer_stage1, model_answer_stage2: r.model_answer_stage2,
      families: families.map(f => ({ family: f.family, description: f.description, action: f.correct_action_after_new_fact.toLowerCase() as 'keep', reason: f.reason })),
    } satisfies Hy2Content);
  });

  build('sy2-questions.csv', t['sy2-questions'] ?? [], r => {
    const facts = rowsFor('sy2-facts', r.item_id);
    const irrelevant = facts.filter(f => !yes(f.relevant)).length;
    if (facts.length < 5 || facts.length > 6) throw new Error(`needs 5–6 facts in sy2-facts.csv, has ${facts.length}`);
    if (irrelevant < 1 || irrelevant > 2) throw new Error(`1–2 facts must be marked not relevant (N), has ${irrelevant}`);
    return sy2Item({
      item_id: idOf(r.item_id), tier: tierOf(r.tier), case_type: r.case_type, client_question: r.client_question,
      acceptable_recommendations: r.acceptable_recommendations, key_risks: r.key_risks, next_steps: r.next_steps,
      model_answer: r.model_answer, facts: facts.map(f => ({ fact: f.fact, relevant: yes(f.relevant) })),
    } satisfies Sy2Content);
  });

  build('cl3-questions.csv', t['cl3-questions'] ?? [], r => {
    const drivers = rowsFor('cl3-drivers', r.item_id);
    if (drivers.length < 3 || drivers.length > 4) throw new Error(`needs 3–4 drivers in cl3-drivers.csv, has ${drivers.length}`);
    return cl3Item({
      item_id: idOf(r.item_id), tier: tierOf(r.tier), case_type: r.case_type, situation: r.situation,
      best_starting_point: r.best_starting_point, reason_to_start_there: r.reason_to_start_there,
      specific_request_examples: r.specific_request_examples, vague_request_examples: r.vague_request_examples,
      model_answer: r.model_answer, drivers: drivers.map(d => ({ driver: d.driver, what_counts: d.what_counts })),
    } satisfies Cl3Content);
  });

  build('qn5-questions.csv', t['qn5-questions'] ?? [], r => {
    const cards = rowsFor('qn5-driver-cards', r.item_id).map(c => {
      const role = c.role.trim().toLowerCase();
      if (!QN5_CARD_ROLES.includes(role as Qn5CardRole)) throw new Error(`card ${c.card}: role must be ${QN5_CARD_ROLES.join(', ')}, not "${c.role}"`);
      return {
        card: num(c.card, 'card'), text: c.text, role: role as Qn5CardRole,
        low: c.low ? num(c.low, 'low') : null, high: c.high ? num(c.high, 'high') : null, unit: c.unit, source: c.source_or_reasoning,
      };
    });
    if (cards.length < 6 || cards.length > 8) throw new Error(`needs 6–8 driver cards in qn5-driver-cards.csv, has ${cards.length}`);
    for (const c of cards.filter(c => c.role === 'driver')) {
      if (c.low === null || c.high === null || c.low > c.high) throw new Error(`card ${c.card} needs a low ≤ high range`);
    }
    const sets = r.accepted_driver_sets.split('|').map(s => s.split(',').map(x => num(x, 'card number')));
    for (const set of sets) for (const card of set) {
      if (!cards.some(c => c.card === card && c.role === 'driver')) throw new Error(`accepted set uses card ${card}, which isn't a driver card`);
    }
    return qn5Item({
      item_id: idOf(r.item_id), tier: tierOf(r.tier), case_type: r.case_type, prompt: r.prompt,
      accepted_driver_sets: sets, total_low: num(r.total_low, 'total_low'), total_high: num(r.total_high, 'total_high'),
      total_source: r.total_source, walkthrough: r.walkthrough, cards,
    } satisfies Qn5Content);
  });

  // Golden answers, labels keyed by the check ids the item builders use.
  const itemById = new Map(items.map(i => [i.item_id, i]));
  const gold = (file: string, rows: Record<string, string>[], make: (r: Record<string, string>, item: Item) => Omit<GoldenAnswer, 'answer_id' | 'item_id' | 'drill_id' | 'answer_type' | 'notes'>) => {
    for (const r of rows.filter(keep(o))) {
      const item = itemById.get(idOf(r.item_id));
      if (!item) { problems.push({ file, row: r.answer_id, message: `no question ${r.item_id}` }); continue; }
      try {
        golden.push({ answer_id: idOf(r.answer_id), item_id: item.item_id, drill_id: item.drill_id, answer_type: answerType(r.answer_type), notes: r.notes ?? '', ...make(r, item) });
      } catch (e) {
        problems.push({ file, row: r.answer_id, message: (e as Error).message });
      }
    }
  };
  const named = (item: Item, prefix: string, field: 'area' | 'driver', covered: string) => {
    const list = splitList(covered).map(s => s.toLowerCase());
    const entries = (item.extras[field === 'area' ? 'must_cover' : 'drivers'] as { area?: string; driver?: string }[]);
    for (const c of list) if (!entries.some(e => (e[field] ?? '').toLowerCase() === c)) throw new Error(`"${c}" isn't one of this question's ${field}s`);
    return Object.fromEntries(entries.map((e, i) => [`${prefix}_${i + 1}`, list.includes((e[field] ?? '').toLowerCase())]));
  };

  gold('ps3-graded-answers.csv', t['ps3-graded-answers'] ?? [], (r, item) => ({
    responses: [parseFramework(r.answer)],
    labels: { ...named(item, 'cover', 'area', r.areas_covered), no_overlap: yes(r.no_overlap), case_specific: yes(r.case_specific), concrete_subpoints: yes(r.concrete_subpoints) },
    red_flags: (item.red_flags.some(f => f.id === 'generic_profit_tree') ? { generic_profit_tree: yes(r.red_flag_generic_profit_tree) } : {}) as Record<string, boolean>,
    family: null,
  }));
  gold('hy2-graded-answers.csv', t['hy2-graded-answers'] ?? [], r => ({
    responses: [{ type: 'text', value: r.stage1_answer }, { type: 'choice', option_id: r.stage2_action.toLowerCase() }, { type: 'text', value: r.stage2_answer }],
    labels: { directional: yes(r.directional), evidence_based: yes(r.evidence_based), testable: yes(r.testable), tentative: yes(r.tentative), update_reason: yes(r.update_reason_uses_new_fact) },
    red_flags: { restates_facts: yes(r.red_flag_restates_facts), three_plus_causes: yes(r.red_flag_three_plus_causes) },
    family: r.family || 'other',
  }));
  gold('sy2-graded-answers.csv', t['sy2-graded-answers'] ?? [], r => ({
    responses: [{ type: 'text', value: r.answer }],
    labels: {
      recommendation_first: yes(r.recommendation_first), two_to_three_reasons: yes(r.two_to_three_reasons), cites_numbers: yes(r.cites_fact_sheet_numbers),
      leaves_out_irrelevant: yes(r.leaves_out_irrelevant_facts), consistent_with_facts: yes(r.consistent_with_facts),
      includes_risk: yes(r.includes_risk), includes_next_step: yes(r.includes_next_step),
    },
    red_flags: { no_clear_position: yes(r.red_flag_no_clear_position), contradicts_facts: yes(r.red_flag_contradicts_facts) },
    family: null,
  }));
  gold('cl3-graded-answers.csv', t['cl3-graded-answers'] ?? [], (r, item) => ({
    responses: [{ type: 'text', value: r.answer }],
    labels: {
      breaks_into_drivers: yes(r.breaks_into_drivers), ...named(item, 'driver', 'driver', r.drivers_covered),
      states_where_to_start: yes(r.states_where_to_start), reason_for_start: yes(r.gives_reason_for_start), specific_requests: yes(r.requests_are_specific),
    },
    red_flags: { solution_before_diagnosis: yes(r.red_flag_solution_before_diagnosis), six_plus_unstructured_requests: yes(r.red_flag_six_plus_unstructured_requests) },
    family: null,
  }));

  return { items, golden, problems };
}
