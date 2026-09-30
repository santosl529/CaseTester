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
const req = (ids: string[], what = 'x'): DetectedDataRequest => ({ what, ledgerItemIds: ids, response: 'none' });

describe('planSameTurnResolution', () => {
  const base = { revealedIds: new Set<string>(), phase: 'ANALYSIS' as Phase, releaseWhenById, spokenText: 'Walk me through your next step.' };

  it('releases a requested item the draft ignored once its stage is reached', () => {
    expect(planSameTurnResolution({ ...base, requests: [req(['menu_price_change'])] }))
      .toEqual({ releaseIds: ['menu_price_change'], defer: false });
  });

  it('defers out loud when the item is held but its stage is not reached yet', () => {
    expect(planSameTurnResolution({ ...base, phase: 'CLARIFY', requests: [req(['cogs_pct'])] }))
      .toEqual({ releaseIds: [], defer: true });
  });

  it('does nothing for items already revealed, before or during this turn', () => {
    const plan = planSameTurnResolution({ ...base, revealedIds: new Set(['menu_price_change']), requests: [req(['menu_price_change'])] });
    expect(plan).toEqual({ releaseIds: [], defer: false });
  });

  it('does nothing for requests the ledger does not hold (refusing those is the model\'s call)', () => {
    expect(planSameTurnResolution({ ...base, requests: [req([])] })).toEqual({ releaseIds: [], defer: false });
  });

  it.each([
    "Hold that — let's come back to it.",
    "I'll come back to that once we have the structure.",
    "I don't have that level of detail.",
    'Which cut do you mean — price per cup or average ticket?',
  ])('leaves a turn alone that already answered the request: %s', spokenText => {
    expect(planSameTurnResolution({ ...base, spokenText, requests: [req(['menu_price_change'])] }))
      .toEqual({ releaseIds: [], defer: false });
  });

  it('releases at most two items and defers the rest, deduped across requests', () => {
    const plan = planSameTurnResolution({
      ...base,
      phase: 'EXHIBIT',
      requests: [req(['menu_price_change', 'avg_ticket']), req(['avg_ticket', 'bean_share_of_cogs'])],
    });
    expect(plan).toEqual({ releaseIds: ['menu_price_change', 'avg_ticket'], defer: true });
  });

  it('mixes release and defer in one turn when stages differ', () => {
    const plan = planSameTurnResolution({ ...base, requests: [req(['stores_count', 'bean_share_of_cogs'])] });
    expect(plan).toEqual({ releaseIds: ['stores_count'], defer: true });
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
