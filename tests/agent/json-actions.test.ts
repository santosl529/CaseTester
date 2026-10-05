import { describe, it, expect } from 'vitest';
import { parseResponse, normalizeActions } from '@/lib/agent/models/json-actions';
import type { ToolIdValidator } from '@/lib/agent/models/interface';

const ids = (valid: string[]): ToolIdValidator => ({
  idKey: 'id',
  resolve: raw => (raw && valid.includes(raw) ? raw : null),
  validOptions: valid,
});
const validators = {
  reveal_data: ids(['cogs_pct', 'labor_pct', 'overhead_pct']),
  show_exhibit: ids(['exhibit-a']),
};
const norm = (raw: unknown[]) => normalizeActions(raw as Record<string, unknown>[], validators);

describe('parseResponse', () => {
  it('reads the actions list', () => {
    expect(parseResponse('{"actions":[{"type":"say","text":"Go on."}]}')).toEqual([{ type: 'say', text: 'Go on.' }]);
  });

  it('returns null for text that is not the response object', () => {
    expect(parseResponse('Okay. Walk me through that.')).toBeNull();
    expect(parseResponse('{"actions": [{"type": "say", "text": "cut of')).toBeNull();
    expect(parseResponse('{"note": "no actions"}')).toBeNull();
  });
});

describe('normalizeActions', () => {
  it('maps to orchestrator actions in order', () => {
    const { actions, retry } = norm([
      { type: 'say', text: 'Here you go.' },
      { type: 'show_exhibit', exhibit_id: 'exhibit-a' },
      { type: 'say', text: 'What stands out?' },
      { type: 'reveal_data', item_id: 'cogs_pct' },
      { type: 'advance_phase' },
    ]);
    expect(actions).toEqual([
      { type: 'speak', text: 'Here you go.' },
      { type: 'show_exhibit', exhibitId: 'exhibit-a' },
      { type: 'speak', text: 'What stands out?' },
      { type: 'reveal_data', itemId: 'cogs_pct' },
      { type: 'advance_phase' },
    ]);
    expect(retry).toBe(false);
  });

  // Replay B, Derek#4: the same three releases and question four times over.
  it('drops repeated actions within a turn', () => {
    const r = (id: string) => ({ type: 'reveal_data', item_id: id });
    const q = { type: 'say', text: 'Which line would you dig into first, and why?' };
    const { actions, report } = norm([
      { type: 'advance_phase' }, r('cogs_pct'), r('labor_pct'), r('overhead_pct'), q,
      { type: 'advance_phase' }, r('cogs_pct'), r('labor_pct'), r('overhead_pct'), q,
      { type: 'advance_phase' }, { type: 'advance_phase' },
    ]);
    expect(actions.map(a => a.type)).toEqual(['advance_phase', 'reveal_data', 'reveal_data', 'reveal_data', 'speak']);
    expect(report.dropped.filter(d => d.reason === 'duplicate')).toHaveLength(7);
  });

  // Replay B, Derek#20: asked for the recommendation, ended, then junk.
  it('keeps end_case only as the last action and drops a junk tail', () => {
    const { actions, report, retry } = norm([
      { type: 'advance_phase' },
      { type: 'say', text: "Okay. Given everything we've covered, what is your recommendation to the CEO?" },
      { type: 'end_case' },
      { type: 'say', text: 'Understood.' },
      { type: 'reveal_data', item_id: 'bogus' },
      { type: 'say', text: 'x' },
    ]);
    expect(actions).toEqual([
      { type: 'advance_phase' },
      { type: 'speak', text: "Okay. Given everything we've covered, what is your recommendation to the CEO?" },
    ]);
    expect(report.dropped.map(d => d.reason)).toEqual(['end_not_last', 'after_end', 'after_end', 'after_end']);
    // The bad id is dropped with the tail; it doesn't force a regeneration.
    expect(report.invalidIds).toEqual([]);
    expect(retry).toBe(false);
  });

  it('drops an end_case that follows a question in the same turn', () => {
    const { actions, report } = norm([
      { type: 'say', text: 'What would you tell the CEO?' },
      { type: 'end_case' },
    ]);
    expect(actions).toEqual([{ type: 'speak', text: 'What would you tell the CEO?' }]);
    expect(report.dropped[0].reason).toBe('end_after_question');
  });

  it('keeps a plain closing end_case', () => {
    const { actions } = norm([{ type: 'say', text: 'Understood.' }, { type: 'end_case' }]);
    expect(actions.at(-1)).toEqual({ type: 'end_case' });
  });

  it('reports unknown ids and asks for a retry', () => {
    const { actions, report, retry } = norm([
      { type: 'reveal_data', item_id: 'revenue_total' },
      { type: 'say', text: 'What do you make of that?' },
    ]);
    expect(actions).toEqual([{ type: 'speak', text: 'What do you make of that?' }]);
    expect(report.invalidIds).toEqual([{ type: 'reveal_data', id: 'revenue_total' }]);
    expect(retry).toBe(true);
  });

  it('drops spoken lines with no real words', () => {
    const { actions } = norm([{ type: 'say', text: 'x' }, { type: 'say', text: '  ' }, { type: 'say', text: 'Go on.' }]);
    expect(actions).toEqual([{ type: 'speak', text: 'Go on.' }]);
  });

  it('asks for a retry when nothing usable is left', () => {
    const { actions, retry, report } = norm([{ type: 'say', text: '.' }, { type: 'dance' }]);
    expect(actions).toEqual([]);
    expect(report.empty).toBe(true);
    expect(retry).toBe(true);
  });

  it('caps a turn at 8 actions', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ type: 'say', text: `Line number ${i}.` }));
    const { actions, report } = norm(many);
    expect(actions).toHaveLength(8);
    expect(report.capped).toBe(true);
  });
});
