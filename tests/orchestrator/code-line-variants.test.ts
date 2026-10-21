// Five versions of every code-written line without case facts (Lorenzo's
// brief B, 18 Oct). Each version:
//   - keeps exactly the figures and case terms of a line said before the brief
//     and adds none — so no version leads or adds a claim;
//   - reads to every live and scoring recognizer exactly as a line said before
//     the brief does (a version may not ask, close, refuse, promise or count
//     as a stage differently);
//   - is recorded as itself, so the last-3 rule holds.
// The lines said before the brief: fixtures/code-lines-before-b.json (the
// registry at c8bee49, = club-beta-2's wording).
import { describe, it, expect } from 'vitest';
import BEFORE from './fixtures/code-lines-before-b.json';
import { PHRASE_POOLS, PHRASE_MEMORY, fill, phrase, poolPattern, recordPhraseUses, slotOf, variantIndex, type PhrasePool, type PhraseUses } from '@/lib/orchestrator/phrasing';
import { hasCloseCue } from '@/lib/agent/prompts/scripts';
import {
  isClosingTurn, asksForConclusion, asksRecommendationAsk, asksRiskQuestion, asksBrainstorm, asksRisk,
  namesCandidateRecommendation, isReportAnswer,
} from '@/lib/orchestrator/spoken-close';
import { askIntents } from '@/lib/orchestrator/ask-intent';
import { probeIntents, refersToFigures, WHERE_TO_START } from '@/lib/orchestrator/pressure-test';
import { stageQuestions, asksBrainstormNow } from '@/lib/orchestrator/stage-evidence';
import { sentencesOf } from '@/lib/orchestrator/stall';
import { isDeliveryClaim, isHandoverAnnouncement, isBareAcknowledgment, vetoReason, type GateContext } from '@/lib/orchestrator/stream-turn';
import { promisesExhibit } from '@/lib/orchestrator/exhibits';
import { promisesReveal, handoffSentences } from '@/lib/orchestrator/data-ledger';
import { isGradingSentence } from '@/lib/orchestrator/grading';
import { auditTurnStyle, rewriteSystemLanguage, stripMetaLeak } from '@/lib/orchestrator/audit';
import { isGrowthProbe } from '@/lib/orchestrator/growth-probe';
import { classifyMathTalk } from '@/lib/orchestrator/math-talk';
import { suppliesRecommendation } from '@/lib/orchestrator/synthesis-guard';
import { statesQuantitativeClaim } from '@/lib/orchestrator/math-checker';
import { CLOSE_WAIT_FIRST, CLOSE_WAIT_MITIGATED } from '@/lib/orchestrator/close-hold';
import { factBaseFor, findFalseRefusals, findUndeliveredClaims, findFalseFacts } from '@/lib/orchestrator/fact-check';
import { DEFER, EARLIER } from '@/lib/eval/data-check';
import { CORRECTION, asksWorking } from '@/lib/eval/math-check';
import { ECHO_PROBE } from '@/lib/orchestrator/fact-check';
import { asOriginalProbe, PROBE_POOLS } from '@/lib/orchestrator/phrasing';
import { isSilenceLine } from '@/lib/orchestrator/silence';
import { stripCopiedCheckIn } from '@/lib/orchestrator/audit';
import { getCaseById } from '@/lib/cases/loader';

// A pool Lorenzo worded himself as one line (19 Oct, round-2 ruling 3: "We won't
// get to <ask> today."; round-3 ruling 4: "…that today." for a long or list ask):
// no versions, no line said before the brief — their own blocks below.
const ONE_LINE: PhrasePool[] = ['wont_get_to', 'wont_get_to_that'];
// A lead-in, not a line (19 Oct, round-4 ruling 6): the words that open a checker probe's "You said …" — its own block.
const FRAGMENT: PhrasePool[] = ['probe_opener'];
const POOLS = (Object.keys(PHRASE_POOLS) as PhrasePool[]).filter(p => !ONE_LINE.includes(p) && !FRAGMENT.includes(p));
const before = BEFORE as Record<string, string[]>;
const versions = (p: PhrasePool) => PHRASE_POOLS[p] as readonly string[];

// What fills a slot, per pool: the kind of text code puts there live.
const ASK = 'which branch would you start with, and why?';
const SLOT: Partial<Record<PhrasePool, string>> = {
  defer: 'the cost breakdown', refuse: 'the cost breakdown', exhibit: 'Brew & Bean Cost Structure Over Time',
  restate_exhibit: 'Menu prices have not changed in two years.', restate: 'Menu prices have not changed in two years.', correct_one: 'COGS is 58% of revenue today, up from 42% two years ago.',
  correct_two: 'COGS is 58% of revenue today, up from 42% two years ago. Labor is 22% of revenue, and it’s been stable.',
  wrap_up: 'walk me through how you got to 38%.', gate_defer: 'the cost breakdown', offer: 'the cost breakdown',
  before_data: ASK, reask_more: ASK, reask_answer: ASK, reask_back: ASK, concrete: "name one thing your structure doesn't cover yet.",
  got_to: '38%', probe_got_to: '38%', pause: '5 minutes', stall_lead: "The question on the table is how you'd size the margin gap.",
  restate_pointer: 'It has revenue and contribution by route for both years.', restate_recent: 'the network totals',
};
const filled = (p: PhrasePool, v: string) => fill(v, SLOT[p] ?? '');
const template = (v: string) => v.replace(/\{[xX]\}/g, ' ');

// ---- what a line says: figures and case terms ----
const NUMBER_WORDS = /\b(?:two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|hundred|thousand|million|billion|half|double|twice)\b/gi;
const figuresOf = (t: string) => [...(t.match(/\d+(?:\.\d+)?%?/g) ?? []), ...(t.match(NUMBER_WORDS) ?? []).map(w => w.toLowerCase())].sort().join(',');
// The interview's own nouns: naming one a line didn't is a lead or a claim
// ("case" as in "working through the case" is none: it names the interview; nor
// "calculation" / "math": the candidate's own working).
// Synonyms share a class (a figure is a number).
const TERM_CLASSES: [string, RegExp][] = [
  ['figure', /\b(?:figures?|numbers?)\b/i], ['data', /\bdata\b/i], ['exhibit', /\bexhibits?\b/i],
  ['structure', /\bstructur(?:e|es|ing)\b/i], ['analysis', /\banalys[ie]s\b/i], ['recommendation', /\brecommend(?:ation|ations|ed|ing)?\b/i],
  ['risk', /\brisks?\b|\bde-?risk\b/i], ['ceo', /\bCEO\b/], ['client', /\bclient'?s?\b/i],
  ['branch', /\bbranch(?:es)?\b/i], ['hypothesis', /\bhypothes[ie]s\b/i], ['lever', /\blevers?\b/i], ['report', /\breports?\b/i],
 ['correct', /\bcorrect(?:ed|ion|ions|ing)?\b/i],
  // The clock ("we're at time"), not "take your time".
  ['time', /\b(?:at|near|close to|out of|our) time\b|\btime'?s (?:up|nearly up)\b|\btime limit\b|\bthat'?s (?:our )?time\b|\bclock\b|\btime left\b/i],
  ['margin', /\bmargins?\b/i], ['cost', /\bcosts?\b|\bCOGS\b/i], ['price', /\bpric(?:e|es|ing)\b/i], ['revenue', /\brevenue\b/i],
  ['store', /\bstores?\b/i], ['evidence', /\bevidence\b/i], ['option', /\boptions?\b/i],
];
const termsOf = (t: string) => TERM_CLASSES.filter(([, re]) => re.test(t)).map(([k]) => k).sort().join(',');

describe('probe_opener: the lead-in of a "You said …" probe', () => {
  it('five distinct lead-ins, the original first; the echo-probe reader reads each with a claim after it', () => {
    const vs = versions('probe_opener');
    expect(vs).toHaveLength(5);
    expect(new Set(vs).size).toBe(5);
    expect(vs[0]).toBe('You said');
    for (const v of vs) expect(ECHO_PROBE.test(`${v} “5 points” — which cost lines did you include?`), v).toBe(true);
  });
});

describe('every pool has five versions', () => {
  it.each(POOLS)('%s: five distinct versions, the lines said before among them, one slot where they had one', pool => {
    const vs = versions(pool);
    expect(vs).toHaveLength(5);
    expect(new Set(vs).size).toBe(5);
    expect(vs[0]).toBe(before[pool][0]);                 // the first line is the original
    const slots = (v: string) => (v.match(/\{[xX]\}/g) ?? []).length;
    for (const v of vs) expect(slots(v), v).toBe(slots(before[pool][0]));
  });
});

describe('no version leads or adds a claim: the same figures and case terms as a line said before', () => {
  it.each(POOLS)('%s', pool => {
    const ok = new Set(before[pool].map(v => `${figuresOf(template(v))}|${termsOf(template(v))}`));
    for (const v of versions(pool)) expect(ok, `${pool}: "${v}" has ${figuresOf(template(v))} | ${termsOf(template(v))}`).toContain(`${figuresOf(template(v))}|${termsOf(template(v))}`);
  });
});

// ---- every recognizer reads each version as it reads a line said before ----
const prof = getCaseById('prof-001');
const fb = factBaseFor(prof as never);
const gate: GateContext = { allowedTexts: [], verified: [], alreadyProbed: new Set(), flaggedThisTurn: false, openItems: [], phase: 'ANALYSIS' };
const anySentence = (t: string, f: (s: string) => boolean) => sentencesOf(t).some(f);
const RECOGNIZERS: [string, (t: string) => unknown][] = [
  ['hasCloseCue', hasCloseCue],
  ['isClosingTurn', isClosingTurn],
  ['asksForConclusion', asksForConclusion],
  ['asksRecommendationAsk', asksRecommendationAsk],
  ['asksRiskQuestion(after rec)', t => asksRiskQuestion(t, true)],
  ['asksRiskQuestion(before rec)', t => asksRiskQuestion(t, false)],
  ['asksBrainstorm', asksBrainstorm],
  ['asksRisk', asksRisk],
  ['namesCandidateRecommendation', namesCandidateRecommendation],
  ['isReportAnswer', t => anySentence(t, isReportAnswer)],
  ['askIntents', t => askIntents(t).join(',')],
  ['probeIntents', t => probeIntents(t).join(',')],
  ['refersToFigures', refersToFigures],
  ['whereToStart', t => WHERE_TO_START.test(t)],
  ['closeWait: first', t => CLOSE_WAIT_FIRST.test(t)],
  ['closeWait: mitigated', t => CLOSE_WAIT_MITIGATED.test(t)],
  ['stageQuestions', t => JSON.stringify(stageQuestions(t, { recOnTable: false })) + JSON.stringify(stageQuestions(t, { recOnTable: true }))],
  ['asksBrainstormNow', asksBrainstormNow],
  ['isDeliveryClaim', t => anySentence(t, s => isDeliveryClaim(s))],
  ['isHandoverAnnouncement', t => anySentence(t, isHandoverAnnouncement)],
  ['isBareAcknowledgment', t => anySentence(t, isBareAcknowledgment)],
  ['vetoReason (the model saying it)', t => [...new Set(sentencesOf(t).map(s => vetoReason(s, gate)).filter(Boolean))].sort().join('|')],
  ['promisesExhibit', promisesExhibit],
  ['promisesReveal', promisesReveal],
  ['handoffSentences', t => handoffSentences(t).length],
  ['isGradingSentence', t => anySentence(t, isGradingSentence)],
  ['auditTurnStyle', t => { const a = auditTurnStyle(t); return `${a.violations.join(',')}|${a.flags.join(',')}|${a.questionCount}`; }],
  ['rewriteSystemLanguage', t => rewriteSystemLanguage(t).rewrites.length],
  ['stripMetaLeak', t => stripMetaLeak(t).strippedSentences.length],
  ['isGrowthProbe', t => anySentence(t, isGrowthProbe)],
  ['classifyMathTalk', t => [...new Set(sentencesOf(t).map(s => classifyMathTalk(s, []).kind))].sort().join(',')],
  ['suppliesRecommendation', suppliesRecommendation],
  ['statesQuantitativeClaim', statesQuantitativeClaim],
  ['F1 findFalseFacts', t => findFalseFacts(t, fb, new Set(['cogs_pct', 'labor_pct', 'menu_price_change'])).length],
  ['F3 findFalseRefusals', t => findFalseRefusals(t, fb).flatMap(f => f.items).sort().join(',')],
  ['F4 findUndeliveredClaims', t => findUndeliveredClaims(t, fb, { revealed: new Set(), exhibitShown: false, deliveredNow: false, deliveredPrev: false, refusedNow: false }).map(f => f.why).join(',')],
  ['eval: data-check DEFER', t => DEFER.test(t)],
  ['eval: data-check EARLIER', t => EARLIER.test(t)],
  ['eval: math-check CORRECTION', t => CORRECTION.test(t)],
  ['eval: math-check probe', t => sentencesOf(t).some(asksWorking)],
  ['F2 echo probe', t => ECHO_PROBE.test(asOriginalProbe(t))],
  ['classifyMathTalk (their 38%)', t => [...new Set(sentencesOf(t).map(s => classifyMathTalk(s, [38]).kind))].sort().join(',')],
  ['isSilenceLine', isSilenceLine],
  ['stripCopiedCheckIn', t => stripCopiedCheckIn(t).stripped],
];
const reading = (t: string) => RECOGNIZERS.map(([name, f]) => `${name}=${JSON.stringify(f(t))}`);

// A checker probe is the whole question code asks that turn (settle-turn.ts:
// it replaces the model's), so a question form ("How did you get there?") is the
// same single ask as the original statement: the style audit's question count
// and the say veto's question_in_say read the form, not the ask.
const FORM_ONLY = new Set(['auditTurnStyle', 'vetoReason (the model saying it)']);
const asStatement = (t: string) => t.replace(/\?$/, '.');
describe('every recognizer reads each version as it reads a line said before', () => {
  it.each(POOLS)('%s', pool => {
    const probe = (PROBE_POOLS as readonly string[]).includes(pool);
    const read = (t: string) => probe ? RECOGNIZERS.map(([name, f]) => `${name}=${JSON.stringify(f(FORM_ONLY.has(name) ? asStatement(t) : t))}`) : reading(t);
    const known = before[pool].map(v => read(filled(pool, v)));
    for (const v of versions(pool)) {
      const r = read(filled(pool, v));
      const match = known.some(k => k.every((x, i) => x === r[i]));
      if (!match) {
        // The closest line said before, and where this version reads differently.
        const diffs = known.map(k => k.filter((x, i) => x !== r[i]).map(x => `${x} → ${r[k.indexOf(x)]}`));
        const best = diffs.reduce((a, b) => (b.length < a.length ? b : a));
        expect.fail(`${pool}: "${v}" reads differently: ${best.join('; ')}`);
      }
    }
  });
});

describe('the evaluators find each version as a line of its pool', () => {
  it.each(POOLS)('%s', pool => {
    const re = poolPattern(pool);
    for (const v of versions(pool)) expect(re.test(filled(pool, v)), v).toBe(true);
  });
  it.each(POOLS.filter(p => versions(p)[0].includes('{')))('%s: the slot is read back out', pool => {
    for (const v of versions(pool)) expect(slotOf(pool, filled(pool, v))?.toLowerCase(), v).toBe(SLOT[pool]?.toLowerCase());
  });
});

describe('the last-3 rule', () => {
  it.each(POOLS)('%s: each version heard is recorded as itself', pool => {
    versions(pool).forEach((v, i) => {
      const uses = recordPhraseUses(filled(pool, v), {});
      expect(uses[pool], v).toEqual([i]);
    });
  });
  it.each(POOLS)('%s: never one of the last 3 uses, over 40 uses, in every session', pool => {
    for (const sid of ['a', 'b', 'c', 'd']) {
      let uses: PhraseUses = {};
      const seen: number[] = [];
      for (let turn = 0; turn < 40; turn++) {
        const i = variantIndex(pool, uses, `${sid}:${turn}`);
        expect(seen.slice(-PHRASE_MEMORY)).not.toContain(i);
        seen.push(i);
        uses = recordPhraseUses(phrase(pool, SLOT[pool] ?? '', uses, `${sid}:${turn}`), uses);
      }
    }
  }, 30_000);
});

describe('a one-line pool (wont_get_to)', () => {
  const said = fill(PHRASE_POOLS.wont_get_to[0], 'the cost breakdown');
  it('is one line, said every time', () => {
    expect(PHRASE_POOLS.wont_get_to).toHaveLength(1);
    expect(phrase('wont_get_to', 'the cost breakdown', { wont_get_to: [0, 0, 0] }, 'a:1')).toBe(said);
  });
  it('the evaluators find it, and read its slot back out', () => {
    expect(poolPattern('wont_get_to').test(said)).toBe(true);
    expect(slotOf('wont_get_to', said)).toBe('the cost breakdown');
    expect(recordPhraseUses(said, {}).wont_get_to).toEqual([0]);
  });
  it('reads as a deferral (an ask answered), not the close, a refusal or a delivery', () => {
    expect(DEFER.test(said)).toBe(true);
    expect(hasCloseCue(said)).toBe(false);
    expect(isClosingTurn(said)).toBe(false);
    expect(findFalseRefusals(said, fb)).toEqual([]);
    expect(isDeliveryClaim(said)).toBe(false);
    expect(vetoReason(said, gate)).toBe('data_talk');
  });
});

describe('a one-line pool (wont_get_to_that)', () => {
  const said = PHRASE_POOLS.wont_get_to_that[0];
  it('is one line, said every time', () => {
    expect(PHRASE_POOLS.wont_get_to_that).toEqual(["We won't get to that today."]);
    expect(phrase('wont_get_to_that', '', { wont_get_to_that: [0, 0, 0] }, 'a:1')).toBe(said);
  });
  it('the evaluators find it and record it', () => {
    expect(poolPattern('wont_get_to_that').test(said)).toBe(true);
    expect(recordPhraseUses(said, {}).wont_get_to_that).toEqual([0]);
  });
  it('reads as a deferral (an ask answered), not the close, a refusal or a delivery', () => {
    expect(DEFER.test(said)).toBe(true);
    expect(hasCloseCue(said)).toBe(false);
    expect(isClosingTurn(said)).toBe(false);
    expect(findFalseRefusals(said, fb)).toEqual([]);
    expect(isDeliveryClaim(said)).toBe(false);
    expect(vetoReason(said, gate)).toBe('data_talk');
  });
});
