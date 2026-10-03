import { describe, it, expect } from 'vitest';
import {
  planSameTurnResolution, insertBeforeTrailingQuestions, buildDataRequestPrompt,
  type DetectedDataRequest,
} from '@/lib/orchestrator/data-requests';
import { SAME_TURN_RELEASE_LEADINS, SAME_TURN_DEFER_SCRIPTS } from '@/lib/agent/prompts/scripts';
import { getCaseById } from '@/lib/cases/loader';
import type { Phase } from '@/lib/orchestrator/state-machine';

// Rule 11, same-turn resolution: batch 2 (29–30 Sep) still left 23 requests
// for held data unanswered; the candidate then had to ask again. A request
// detected in the candidate's message that the draft turn ignored is released
// if the case has reached that item's stage, otherwise deferred out loud.
const releaseWhenById = new Map<string, Phase>([
  ['stores_count', 'CLARIFY'],
  ['cogs_pct', 'ANALYSIS'],
  ['menu_price_change', 'ANALYSIS'],
  ['avg_ticket', 'ANALYSIS'],
  ['bean_share_of_cogs', 'EXHIBIT'],
]);
const req = (ids: string[], what = 'x', explicit = true): DetectedDataRequest => ({ what, ledgerItemIds: ids, response: 'none', explicit });

describe('planSameTurnResolution', () => {
  const base = { revealedIds: new Set<string>(), phase: 'ANALYSIS' as Phase, releaseWhenById, spokenText: 'Walk me through your next step.' };

  it('releases a requested item the draft ignored once its stage is reached', () => {
    expect(planSameTurnResolution({ ...base, requests: [req(['menu_price_change'])] }))
      .toMatchObject({ releaseIds: ['menu_price_change'], defer: false });
  });

  it('defers out loud when the item is held but its stage is not reached yet', () => {
    expect(planSameTurnResolution({ ...base, phase: 'CLARIFY', requests: [req(['cogs_pct'])] }))
      .toMatchObject({ releaseIds: [], defer: true });
  });

  it('does nothing for items already revealed, before or during this turn', () => {
    const plan = planSameTurnResolution({ ...base, revealedIds: new Set(['menu_price_change']), requests: [req(['menu_price_change'])] });
    expect(plan).toMatchObject({ releaseIds: [], defer: false });
  });

  // Fix #9 (batch 5–6: ~1–5 per batch ignored with no refusal): an explicit
  // ask for data the case doesn't hold gets a scripted refusal.
  it('refuses an explicit ask for data the ledger does not hold', () => {
    expect(planSameTurnResolution({ ...base, requests: [req([])] }))
      .toEqual({ releaseIds: [], defer: false, offerIds: [], notYet: false, refuseNotInCase: true });
  });

  it.each([
    "Hold that — let's come back to it.",
    "I'll come back to that once we have the structure.",
    "I don't have that level of detail.",
    'Which cut do you mean — price per cup or average ticket?',
  ])('leaves a turn alone that already answered the request: %s', spokenText => {
    expect(planSameTurnResolution({ ...base, spokenText, requests: [req(['menu_price_change']), req(['avg_ticket'], 'x', false), req([])] }))
      .toEqual({ releaseIds: [], defer: false, offerIds: [], notYet: false, refuseNotInCase: false });
  });

  it('releases at most two items and defers the rest, deduped across requests', () => {
    const plan = planSameTurnResolution({
      ...base,
      phase: 'EXHIBIT',
      requests: [req(['menu_price_change', 'avg_ticket']), req(['avg_ticket', 'bean_share_of_cogs'])],
    });
    expect(plan).toMatchObject({ releaseIds: ['menu_price_change', 'avg_ticket'], defer: true });
  });

  it('mixes release and defer in one turn when stages differ', () => {
    const plan = planSameTurnResolution({ ...base, requests: [req(['stores_count', 'bean_share_of_cogs'])] });
    expect(plan).toMatchObject({ releaseIds: ['stores_count'], defer: true });
  });
});

describe('insertBeforeTrailingQuestions', () => {
  it('puts the addition before the question the turn ends on', () => {
    expect(insertBeforeTrailingQuestions('Good. What would you look at next?', 'Menu prices are flat.'))
      .toBe('Good. Menu prices are flat. What would you look at next?');
  });

  it('appends when the turn does not end on a question', () => {
    expect(insertBeforeTrailingQuestions('Good point.', 'Menu prices are flat.')).toBe('Good point. Menu prices are flat.');
  });

  it('handles an empty turn', () => {
    expect(insertBeforeTrailingQuestions('', 'Menu prices are flat.')).toBe('Menu prices are flat.');
  });
});

describe('same-turn scripts', () => {
  it('stay numeral-free (Rule 6 provenance)', () => {
    for (const s of [...SAME_TURN_RELEASE_LEADINS, ...SAME_TURN_DEFER_SCRIPTS]) expect(s).not.toMatch(/\d/);
  });

  it('defer scripts say out loud the data will come later (Rule 11 defer)', () => {
    for (const s of SAME_TURN_DEFER_SCRIPTS) expect(s).toMatch(/come (back )?to (that|it)/i);
  });
});

describe('buildDataRequestPrompt, detection only (no interviewer turn yet)', () => {
  const catalog = getCaseById('prof-001').dataLedger.map(d => ({ id: d.id, label: d.label }));

  it('omits the interviewer turn and the response labels', () => {
    const prompt = buildDataRequestPrompt('What happened to menu prices?', null, catalog);
    expect(prompt).toContain('What happened to menu prices?');
    expect(prompt).not.toContain("INTERVIEWER'S NEXT TURN");
    expect(prompt).not.toContain('"release"');
  });
});

// Batch 6, Lena: the draft deferred in its own words and the scripted
// deferral was added on top — "Hold both data requests for a moment. … I'll
// come to that data shortly."
describe('respondsToRequest — deferrals in the draft', async () => {
  const { respondsToRequest } = await import('@/lib/orchestrator/data-requests');
  const deferrals = [
    "Hold both data requests for a moment. You've split the problem into revenue and costs. Which branch do you prioritize first, and why?",
    'Hold those for now — first, which bucket would you test first?',
    "Let's park the data for a moment. Walk me through the structure.",
    "We'll come back to the cost breakdown. Which bucket first?",
  ];
  for (const text of deferrals) {
    it(`sees: ${text.slice(0, 50)}…`, () => expect(respondsToRequest(text)).toBe(true));
  }
  it('does not see a plain probe as a response', () => {
    expect(respondsToRequest('Which of your three buckets would you test first, and why?')).toBe(false);
  });
});

// Batch 6, Maya: "I'd check revenue first — price and cups" released the
// average ticket unasked. A passing mention of data gets an offer if its stage
// is reached, or "not at this point" if not — never a release.
describe('planSameTurnResolution — passing mentions', () => {
  const base = { revealedIds: new Set<string>(), phase: 'ANALYSIS' as Phase, releaseWhenById, spokenText: 'Walk me through your next step.' };
  it('offers a mentioned item whose stage is reached, releasing nothing', () => {
    expect(planSameTurnResolution({ ...base, requests: [req(['avg_ticket'], 'price and cups', false)] }))
      .toEqual({ releaseIds: [], defer: false, offerIds: ['avg_ticket'], notYet: false, refuseNotInCase: false });
  });
  it('says "not at this point" for a mentioned item whose stage is not reached', () => {
    expect(planSameTurnResolution({ ...base, phase: 'CLARIFY', requests: [req(['cogs_pct'], 'costs', false)] }))
      .toEqual({ releaseIds: [], defer: false, offerIds: [], notYet: true, refuseNotInCase: false });
  });
  it('a mention adds nothing next to an explicit ask for the same item, or an item already out', () => {
    expect(planSameTurnResolution({ ...base, requests: [req(['avg_ticket']), req(['avg_ticket'], 'ticket', false)] }))
      .toEqual({ releaseIds: ['avg_ticket'], defer: false, offerIds: [], notYet: false, refuseNotInCase: false });
    expect(planSameTurnResolution({ ...base, revealedIds: new Set(['avg_ticket']), requests: [req(['avg_ticket'], 'ticket', false)] }))
      .toEqual({ releaseIds: [], defer: false, offerIds: [], notYet: false, refuseNotInCase: false });
  });
  it('a mention of data the case does not hold is not refused', () => {
    expect(planSameTurnResolution({ ...base, requests: [req([], 'below-the-line items', false)] }))
      .toEqual({ releaseIds: [], defer: false, offerIds: [], notYet: false, refuseNotInCase: false });
  });
  it('an explicit deferral covers a not-yet mention — no second "not yet"', () => {
    expect(planSameTurnResolution({ ...base, phase: 'CLARIFY', requests: [req(['cogs_pct']), req(['menu_price_change'], 'prices', false)] }))
      .toEqual({ releaseIds: [], defer: true, offerIds: [], notYet: false, refuseNotInCase: false });
  });
});

describe('acceptedOffer', async () => {
  const { acceptedOffer } = await import('@/lib/orchestrator/data-requests');
  it.each(['Yes please.', 'Yeah, that would help.', 'Sure — and what about labor?', "I'd like to see it."])('a yes releases the offered items: %s', text => {
    expect(acceptedOffer({ candidateText: text, offeredIds: ['avg_ticket'], revealedIds: new Set() })).toEqual(['avg_ticket']);
  });
  it.each(["No, I'm fine.", 'Not right now, let me finish the structure.', 'So costs went up 16 points, yes, and labor stayed flat.'])('anything else drops the offer: %s', text => {
    expect(acceptedOffer({ candidateText: text, offeredIds: ['avg_ticket'], revealedIds: new Set() })).toEqual([]);
  });
  it('skips offered items released in the meantime', () => {
    expect(acceptedOffer({ candidateText: 'Yes.', offeredIds: ['avg_ticket', 'cogs_pct'], revealedIds: new Set(['cogs_pct']) })).toEqual(['avg_ticket']);
  });
});
