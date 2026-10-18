// Code's connecting words vary (Lorenzo's brief, 17 Oct, item 4a): no variant
// again within its pool's last 3 uses in a session; the content verbatim.
import { describe, it, expect } from 'vitest';
import { PHRASE_POOLS, PHRASE_MEMORY, SEEDED_FIRST, fill, phrase, variantIndex, recordPhraseUses, poolPattern, anyVariant, type PhrasePool, type PhraseUses } from '@/lib/orchestrator/phrasing';
import { hasCloseCue } from '@/lib/agent/prompts/scripts';
import { isClosingTurn, asksRecommendationAsk } from '@/lib/orchestrator/spoken-close';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';

// The data-line pools of item 4a (17 Oct); every pool joins them with brief B (18 Oct).
const POOLS = ['defer', 'refuse', 'exhibit', 'restate', 'earlier', 'correct_one', 'correct_two', 'wrap_up'] as PhrasePool[];
const ALL = Object.keys(PHRASE_POOLS) as PhrasePool[];

describe('the pools', () => {
  it.each(POOLS)('%s: at least 4 variants, so the last-3 rule always leaves one; {x} once (or not at all for a bare lead-in); no figures', pool => {
    const vs = PHRASE_POOLS[pool];
    expect(vs.length).toBeGreaterThanOrEqual(PHRASE_MEMORY + 1);
    expect(new Set(vs).size).toBe(vs.length);
    for (const v of vs) {
      expect(v.split(/\{[xX]\}/).length - 1).toBe(pool === 'earlier' ? 0 : 1);
      expect(v).not.toMatch(/\d/);
    }
  });
  it.each(POOLS)('%s: no variant reads as the close or a recommendation ask', pool => {
    for (const v of PHRASE_POOLS[pool]) {
      const line = v.replace('{x}', 'the store count');
      expect(hasCloseCue(line), line).toBe(false);
      expect(isClosingTurn(line), line).toBe(false);
      expect(asksRecommendationAsk(line), line).toBe(false);
    }
  });
  it('the earlier-ask lead-ins never sound like the end of the case (batch 7)', () => {
    for (const v of PHRASE_POOLS.earlier) expect(v).not.toMatch(/\bwrap|before we (finish|close|end)\b/i);
  });
});

describe('choosing a variant', () => {
  it('the first use in a session is the original line, except where a pool rotated by seed before', () => {
    for (const pool of ALL) if (!SEEDED_FIRST.has(pool)) expect(variantIndex(pool, undefined, 's1:4')).toBe(0);
    expect(phrase('defer', 'the store count', {}, 's1:4')).toBe("I'll come back to the store count shortly.");
  });
  it('never one of the pool\'s last 3 uses — over 40 uses, in every session', () => {
    for (const sid of ['a', 'b', 'c', 'd']) for (const pool of POOLS) {
      let uses: PhraseUses = {};
      const seen: number[] = [];
      for (let turn = 0; turn < 40; turn++) {
        const i = variantIndex(pool, uses, `${sid}:${turn}`);
        expect(seen.slice(-PHRASE_MEMORY)).not.toContain(i);
        seen.push(i);
        uses = recordPhraseUses(phrase(pool, 'the store count', uses, `${sid}:${turn}`), uses);
      }
    }
  });
  it('deterministic: the same uses and seed give the same line (Stream and Settle agree)', () => {
    const uses: PhraseUses = { defer: [0], refuse: [0, 2] };
    expect(phrase('refuse', 'competitor pricing', uses, 's:9')).toBe(phrase('refuse', 'competitor pricing', uses, 's:9'));
  });
});

describe('recording what was said', () => {
  it('each pool\'s variant heard, newest last, at most 3 kept; the longest variant wins', () => {
    let uses = recordPhraseUses("I'll come back to the store count shortly. I don't have competitor pricing.", {});
    expect(uses).toEqual({ defer: [0], refuse: [0] });
    uses = recordPhraseUses('Let me ask one more thing as we wrap up — walk me through that calculation.', uses);
    expect(uses.wrap_up).toEqual([1]);
    const said = (i: number) => fill(PHRASE_POOLS.defer[i], 'the ticket');
    uses = recordPhraseUses(said(1), recordPhraseUses(said(2), recordPhraseUses(said(3), uses)));
    expect(uses.defer).toEqual([3, 2, 1]);
  });
  it('a line not said (cut off) is not recorded: Settle reads the heard text', () => {
    expect(recordPhraseUses('Mm-hm. What would you look at next?', { defer: [0] })).toEqual({ defer: [0] });
  });
});

describe('the data lines', () => {
  const d = { correction: null, releases: [], restates: [], exhibit: { id: 'exhibit-a', title: 'Cost Structure Over Time' }, refusals: ['competitor pricing'], defers: ['the ticket'], gateDefers: [], unmappedDefer: false, offers: [] } as never;
  it('first time the original words; later another variant — the content verbatim', () => {
    expect(renderDataLines(d, 's:3')).toEqual(["Here's an exhibit: Cost Structure Over Time.", "I don't have competitor pricing.", "I'll come back to the ticket shortly."]);
    const later = renderDataLines(d, 's:9', { exhibit: [0], refuse: [0], defer: [0] });
    expect(later[0]).not.toBe("Here's an exhibit: Cost Structure Over Time.");
    expect(later[0]).toMatch(anyVariant('exhibit', 'Cost Structure Over Time'));
    expect(later[1]).toMatch(/competitor pricing/i);
    expect(later[2]).toMatch(/the ticket/i);
  });
});

describe('the evaluators read every variant', () => {
  it.each(POOLS)('%s', pool => {
    const re = poolPattern(pool);
    for (const v of PHRASE_POOLS[pool]) expect(re.test(v.replace('{x}', 'the ticket'))).toBe(true);
  });
});

// Lorenzo, 18 Oct: no live check may match only the old wording. The model
// hears code's variants in the transcript; said in its own "say", each is data
// talk (withheld), as the original wording always was.
import { vetoReason, isHandoverAnnouncement, type GateContext } from '@/lib/orchestrator/stream-turn';
describe('the model saying a variant of code\'s line is still data talk', () => {
  const g: GateContext = { allowedTexts: ['The cost structure over time.'], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false, openItems: [], phase: 'ANALYSIS' };
  it.each([
    ...PHRASE_POOLS.defer.map(v => fill(v, 'the cost structure')),
    ...PHRASE_POOLS.refuse.map(v => fill(v, 'competitor pricing')),
    ...PHRASE_POOLS.restate.map(v => v.replace('{x}', 'menu prices have not changed in two years.')),
    ...PHRASE_POOLS.earlier.map(v => `${v} menu prices have not changed in two years.`),
  ])('%s', s => expect(vetoReason(s, g)).toBe('data_talk'));
  it.each(["Here's an exhibit.", 'Take a look at this exhibit.', 'Have a look at this exhibit.', "I'll put up an exhibit."])('a handover in the question: %s', s => expect(isHandoverAnnouncement(s)).toBe(true));
  it.each([...PHRASE_POOLS.gate_defer, ...PHRASE_POOLS.offer, ...PHRASE_POOLS.unmapped_defer].map(v => fill(v, 'the cost breakdown')))('%s', s => expect(vetoReason(s, g)).toBe('data_talk'));
  it.each(['Let me get to the point.', 'You repeated the 16 points.', 'Got it, a cost-first view.'])('not data talk: %s', s => expect(vetoReason(s, g)).not.toBe('data_talk'));
});

// Brief B (18 Oct): every code-written line without case facts lives in one registry.
import { pickScript } from '@/lib/agent/prompts/scripts';
describe('the registry keeps the old choices', () => {
  it('a pool that rotated by seed picks, on its first use, what pickScript picked', () => {
    for (const pool of ALL) if (SEEDED_FIRST.has(pool)) for (const seed of ['s1:4', 'abc:12', 'x:0', '9ccf0836:31']) {
      expect(phrase(pool, '', undefined, seed)).toBe(pickScript(PHRASE_POOLS[pool], seed));
    }
  });
  it('no line is in two pools (each heard line is recorded once)', () => {
    const seen = new Map<string, string>();
    for (const pool of ALL) for (const v of PHRASE_POOLS[pool]) { expect(seen.get(v), `${pool}: ${v}`).toBeUndefined(); seen.set(v, pool); }
  });
});
