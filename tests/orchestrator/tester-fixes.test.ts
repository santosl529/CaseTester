// Tester fixes (Lorenzo's rulings of 29 Oct on session aae091ff, Brew & Bean, voice): the pure pieces of
// `recLastQuestion`, `stuckRescue` and `unrevealedPresupposition`. The turns themselves are proved on the session's
// own replay (`.superpowers/sdd/2026-10-29-tester-fixes/gate-report.md`).
import { describe, it, expect } from 'vitest';
import { PHRASE_POOLS } from '@/lib/orchestrator/phrasing';
import { asksRecommendationAsk, asksRiskQuestion, isClosingTurn } from '@/lib/orchestrator/spoken-close';
import { stageQuestions, updateStages, namesRisk, INITIAL_STAGES } from '@/lib/orchestrator/stage-evidence';
import { classifyTurn, evaluateStall, substantiveReply, answersRecommendationAsk, INITIAL_STALL_STATE } from '@/lib/orchestrator/stall';
import { findPresuppositions } from '@/lib/orchestrator/presupposition';
import { contentWords, nextChain, samePoint } from '@/lib/orchestrator/stuck-point';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import { getCaseById } from '@/lib/cases/loader';

// aae091ff's own lines.
const T21 = "So I'm seeing that, um, you know, our beans have increased quite a bit, but it's similar also to the other input costs. And the other input costs make up a much larger portion. And so I think the the problem more so lies in with the increase in the input costs of the dairy packaging and food. And so because of the dramatic increase and because revenues have grown, I'm more inclined to think that the problem is with the cost. ,";
const T35 = "I would choose... so, like, the price increases, we haven't increased our price in quite a while. And so I think consumers would be okay with a slight price price increase, especially when our cost has increased by so much.";
const T26Q = 'Given what you now know about prices, what does that tell you about how the client responded to those input cost increases, and what does it say about the root cause of the margin decline?';

describe('recLastQuestion: the asks', () => {
  for (const pool of ['rec_ask_full', 'grace_ask_full', 'time_warning_full'] as const) {
    it.each([...PHRASE_POOLS[pool]])(`${pool}: "%s" asks for the recommendation and the risk, and closes nothing`, v => {
      expect(asksRecommendationAsk(v)).toBe(true);
      expect(asksRiskQuestion(v, true)).toBe(true);
      expect(stageQuestions(v, { recOnTable: false })).toMatchObject({ recommendation: true, risk: true, brainstorm: false });
      expect(/next step|what comes next|do next/i.test(v)).toBe(true);
      expect(isClosingTurn(v)).toBe(false);
      expect(/\d/.test(v)).toBe(false);
    });
  }
});

describe('recLastQuestion: what counts as the recommendation', () => {
  it('t35 — read by no pattern before — is a substantive reply', () => {
    expect(answersRecommendationAsk(T35, classifyTurn(T35, null).kind)).toBe(false);
    expect(substantiveReply(T35)).toBe(true);
  });
  it.each([
    'Can you repeat the question?', 'Sorry, could you say that again?', 'Give me a minute.', 'Let me think about that for a second.',
    "I'm not sure.", "I can't commit without more data.", 'What happened with prices?', 'Um.', 'Okay.',
  ])('"%s" is not: the normal handling, and the next substantive reply counts', t => expect(substantiveReply(t)).toBe(false));
  it('a filler word does not stop a recommendation counting', () => {
    expect(substantiveReply("Um, I'd raise prices on the drinks where people are less price sensitive, and renegotiate the bean contract.")).toBe(true);
  });
});

describe('recLastQuestion: the risk asked inside the recommendation question', () => {
  const ask = PHRASE_POOLS.rec_ask_full[0];
  const asked = () => updateStages({ ...INITIAL_STAGES, brainstorm: { delivered: true, deliveredAt: 30, outcome: 'answered' } }, {
    turnIndex: 34, candidateText: 'Maybe we could advertise our higher-margin products.', question: ask, exhibitShown: false, released: false,
    recAsked: false, recommendationDelivered: false, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0, riskWithRecommendation: true,
  });
  const reply = (text: string) => updateStages(asked(), {
    turnIndex: 36, candidateText: text, question: '', exhibitShown: false, released: false, recAsked: false,
    recommendationDelivered: true, pressureTest: INITIAL_PRESSURE_TEST, candidateFigures: 0, ended: null, riskWithRecommendation: true,
  });
  it('one question delivers both stages', () => {
    const r = asked();
    expect(r.recommendation.delivered && r.risk.delivered && r.risk.withRecommendation).toBe(true);
  });
  it('t35 names no risk: the risk is recorded as asked, none named — no follow-up', () => {
    const r = reply(T35);
    expect(r.recommendation.outcome).toBe('answered');
    expect(r.risk).toMatchObject({ outcome: 'unable', noneNamed: true });
    expect(r.pending).toBeNull();
  });
  it('an answer that names a risk answers it', () => {
    expect(reply("I'd raise prices 10% on lattes. The main risk is losing volume, so I'd pilot it in twenty stores first.").risk.outcome).toBe('answered');
    expect(namesRisk('The downside is customers trading down to cheaper coffee.')).toBe(true);
    expect(namesRisk('What is the risk?')).toBe(false);
  });
  it('a question back leaves the pair pending', () => {
    const r = reply('Do you mean for the whole chain?');
    expect(r.risk.outcome).toBeUndefined();
    expect(r.pending).toBe('risk');
  });
});

describe('stuckRescue: a filler word alone is no hedge', () => {
  it('t21 — a real analysis with "um" — counted as a hedge before, analysis under the switch', () => {
    expect(classifyTurn(T21, null).kind).toBe('hedge');
    expect(classifyTurn(T21, null, { fillerHedge: false }).kind).toBe('analysis');
  });
  it.each(["Um, I'm not sure.", 'Uh.', 'Um, maybe costs?', "Hmm, I don't know where to start, honestly, there's a lot here."])('"%s" stays a hedge', t =>
    expect(classifyTurn(t, null, { fillerHedge: false }).kind).toBe('hedge'));
  it('typed text without fillers reads the same either way', () => {
    for (const t of ["I'm not sure.", 'COGS rose from 42% to 58%, so costs are the driver.', 'Can I see the cost breakdown?'])
      expect(classifyTurn(t, null, { fillerHedge: false })).toEqual(classifyTurn(t, null));
  });
});

describe('stuckRescue: no bare re-ask', () => {
  it('t23 + t25 (two "not sure") fire the hint, not the restate', () => {
    const opts = { fillerHedge: false, skipRestate: true };
    const a = evaluateStall(T21, 'ANALYSIS', INITIAL_STALL_STATE, opts);
    const b = evaluateStall("I'm not sure.", 'ANALYSIS', a.state, opts);
    const c = evaluateStall("I'm not sure. I don't know. I think cost is a problem.", 'ANALYSIS', b.state, opts);
    expect([a.intervene, b.intervene, c.intervene]).toEqual([false, false, true]);
    expect(c.rung).toBe(2);
    const d = evaluateStall('No idea.', 'ANALYSIS', c.state, opts);
    const e = evaluateStall('Not sure.', 'ANALYSIS', d.state, opts);
    expect(e.rung).toBe(3);
  });
  it('switch off: today\'s ladder (t21 counts, rung 1 at t23)', () => {
    const a = evaluateStall(T21, 'ANALYSIS', INITIAL_STALL_STATE);
    const b = evaluateStall("I'm not sure.", 'ANALYSIS', a.state);
    expect(b.rung).toBe(1);
  });
});

describe('stuckRescue: the point cap', () => {
  // aae091ff t38, t40, t42, t44: four questions on sizing the price increase.
  const qs = [
    'How would you size the price increase needed, and what would you compare it against to know it closes the gap?',
    'Which specific figures would you compare, and what calculation would tell you the size of the price increase?',
    "With the cost and margin figures you've seen, how would you work out the gap you'd need the price increase to close? Walk me through the calculation.",
    'What would you do with those two numbers to size the price increase, even roughly?',
  ];
  it('they are one point; the third is past the cap', () => {
    let chain = nextChain(undefined, qs[0], 38, false);
    chain = nextChain(chain, qs[1], 40, false);
    expect(chain?.asks).toBe(2);
    expect(samePoint(qs[2], chain)).toBe(true);
    expect(samePoint(qs[3], chain)).toBe(true);
  });
  it('a different question is a new point; a handover always is', () => {
    const chain = nextChain(nextChain(undefined, qs[0], 38, false), qs[1], 40, false);
    expect(samePoint('Beyond what we\'ve discussed, what else could the client do to reverse the margin decline?', chain)).toBe(false);
    expect(nextChain(chain, qs[2], 42, true)?.asks).toBe(1);
  });
  it('content words drop the question\'s grammar', () => {
    expect(contentWords('What would you do with those numbers?')).toEqual(['number']);
  });
});

describe('unrevealedPresupposition', () => {
  const c = getCaseById('prof-001');
  const items = c.dataLedger.map(d => ({ id: d.id, label: d.label, askPhrases: d.askPhrases, spoken: d.spoken }));
  // What aae091ff had at t26: the cost lines, both input changes and the bean share; not the menu prices.
  const revealed = new Set(['cogs_pct', 'labor_pct', 'overhead_pct', 'bean_price_change', 'non_bean_input_change', 'bean_share_of_cogs']);
  it('t26: "what you now know about prices" presupposes the menu prices', () => {
    const r = findPresuppositions(T26Q, items, revealed);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].items).toEqual(['menu_price_change']);
    expect(r.hits[0].shared).toContain('bean_price_change');
  });
  it('no hit once the item is out', () => {
    expect(findPresuppositions(T26Q, items, new Set([...revealed, 'menu_price_change'])).hits).toEqual([]);
  });
  it.each([
    'With that in hand, what would you look at next?',
    'As you\'ve seen, the cost side moved most. Where does that leave you?',
  ])('cue only — counted, never withheld: "%s"', s => {
    const r = findPresuppositions(s, items, revealed);
    expect(r.hits).toEqual([]);
    expect(r.cueOnly).toBe(true);
  });
  it.each([
    'Now that you have your structure, where would you start?',
    'Given what you know about labor, which line matters most?',
    'What would you want to know about prices?',
  ])('no presupposition of unrevealed data: "%s"', s => expect(findPresuppositions(s, items, revealed).hits).toEqual([]));
  it('names the item in other words', () => {
    expect(findPresuppositions('Now that you have the menu price history, what does it tell you?', items, revealed).hits[0]?.items).toEqual(['menu_price_change']);
  });
});
