import { describe, it, expect } from 'vitest';
import { ItemSchema, type ItemInput } from '@/lib/drills/item-schema';
import { toPublicItem } from '@/lib/drills/public-item';
import { percentChange } from '@/lib/drills/generators/percent-change';

// An authored PS-1 item, per the PRD's item format.
const ps1 = (): ItemInput => ({
  item_id: 'ps1-0001',
  version: 1,
  drill_id: 'PS-1',
  status: 'live',
  level: 1,
  tier: 2,
  skills: ['PS.mece', 'PS.case_specific'],
  case_type: 'market_entry',
  prompt: 'A regional gym chain is considering an at-home fitness subscription. Which flaw does this framework have?',
  exhibit: null,
  input: { type: 'single_choice' },
  options: [
    { id: 'a', text: 'Buckets 2 and 3 overlap', correct: true, feedback: 'Both cover pricing.' },
    { id: 'b', text: 'Missing: competitor response', correct: false, tag: 'M.missing_bucket', feedback: 'Competitors are covered in bucket 1.' },
    { id: 'c', text: "Bucket 4 doesn't matter here", correct: false, tag: 'M.irrelevant_bucket', feedback: 'Capabilities matter for a launch.' },
    { id: 'd', text: 'It is a generic profit tree', correct: false, tag: 'M.generic_framework', feedback: 'The buckets are specific to the launch.' },
  ],
  numeric: null,
  checks: [],
  red_flags: [],
  model_answer: null,
  explanation: 'Buckets 2 and 3 both test pricing.',
  extras: { corrected_framework: 'SECRET-CORRECTED-FRAMEWORK' },
  authorship: { author_of_record: 'Reviewer', drafting_model: 'claude-opus-5-5', reviewed_by: 'Reviewer', reviewed_at: '2026-10-06', similarity_check: 'passed' },
  generator: null,
  firm_style: null,
});

const errors = (input: ItemInput) => {
  const r = ItemSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map(i => i.message);
};

describe('ItemSchema (PRD "Item format")', () => {
  it('accepts a well-formed authored item', () => {
    expect(errors(ps1())).toEqual([]);
  });

  it('needs exactly one correct option on a single-choice item', () => {
    const item = ps1();
    item.options[1].correct = true;
    expect(errors(item)).toContain('Single choice needs exactly 1 correct option, has 2');
  });

  it('needs a mistake tag on every wrong option', () => {
    const item = ps1();
    delete item.options[1].tag;
    expect(errors(item)).toContain('Wrong option b needs a mistake tag');
  });

  it('rejects tags that are not in the taxonomy', () => {
    const item = ps1();
    item.options[1].tag = 'M.made_up';
    expect(errors(item)).toContain('Unknown mistake tag M.made_up');
  });

  it("rejects tags outside the drill's skills", () => {
    const item = ps1();
    item.options[1].tag = 'M.buried_recommendation';
    expect(errors(item)).toContain("Option b: tag M.buried_recommendation is outside PS-1's skills");
  });

  it('rejects a level or input type the drill does not use', () => {
    const item = ps1();
    item.level = 2;
    item.input = { type: 'free_text' };
    expect(errors(item)).toEqual(expect.arrayContaining(['PS-1 is a level 1 drill', "PS-1 doesn't take free_text input"]));
  });

  it('rejects duplicate options', () => {
    const item = ps1();
    item.options[2].text = item.options[1].text;
    expect(errors(item)).toContain(`Duplicate option text "${item.options[1].text}"`);
  });

  it('keeps authored and generated items apart', () => {
    const item = ps1();
    item.generator = { template_id: 'x', template_version: 1, seed: 1 };
    expect(errors(item)).toContain('PS-1 items are authored; only generated items carry a generator ref');
  });

  it('needs checks summing to 1 on checklist drills', () => {
    const item: ItemInput = {
      ...ps1(), item_id: 'sy2-0001', drill_id: 'SY-2', level: 2, skills: ['SY.answer_first'],
      input: { type: 'free_text', max_words: 120 }, options: [],
      checks: [{ check_id: 'rec_first', question: 'Does the first sentence state a recommendation?', weight: 0.2, fail_tag: 'M.buried_recommendation', feedback: 'Lead with the answer.' }],
    };
    expect(errors(item)).toContain('Check weights sum to 0.2, not 1');
  });
});

describe('toPublicItem (answer keys never reach the client)', () => {
  const KEY_FIELDS = ['correct', 'tag', 'feedback', 'numeric', 'checks', 'red_flags', 'model_answer', 'explanation', 'extras', 'authorship', 'generator', 'sources', 'trap_values', 'answer'];

  const keysDeep = (value: unknown, out = new Set<string>()): Set<string> => {
    if (Array.isArray(value)) value.forEach(v => keysDeep(v, out));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) { out.add(k); keysDeep(v, out); }
    }
    return out;
  };

  it('strips every key field from an authored item', () => {
    const pub = toPublicItem(ItemSchema.parse(ps1()));
    const keys = keysDeep(pub);
    for (const field of KEY_FIELDS) expect(keys.has(field), field).toBe(false);
    expect(JSON.stringify(pub)).not.toContain('SECRET-CORRECTED-FRAMEWORK');
    expect(JSON.stringify(pub)).not.toContain('Both cover pricing');
    expect(pub.options).toEqual([
      { id: 'a', text: 'Buckets 2 and 3 overlap' },
      { id: 'b', text: 'Missing: competitor response' },
      { id: 'c', text: "Bucket 4 doesn't matter here" },
      { id: 'd', text: 'It is a generic profit tree' },
    ]);
  });

  it('strips the answer, traps and seed from generated items', () => {
    for (const seed of [1, 2, 3]) {
      const item = percentChange.generate(seed, 3);
      const pub = toPublicItem(item);
      const keys = keysDeep(pub);
      for (const field of KEY_FIELDS) expect(keys.has(field), field).toBe(false);
      expect(JSON.stringify(pub)).not.toContain(item.explanation);
      expect(pub).toEqual({ drill_id: 'QN-3', level: 2, tier: 3, prompt: item.prompt, exhibit: null, input: { type: 'numeric' }, options: [] });
    }
  });
});
