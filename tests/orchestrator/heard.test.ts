// What the candidate heard decides what a voice turn books and saves (spec
// 2026-10-08-voice-phase-b §5.3–5.4). Pure: no database, no model.
import { describe, it, expect } from 'vitest';
import { applyHeard, heardRequestRows, unheardQuestionPressureTest, type ComposedTurn } from '@/lib/orchestrator/heard';
import { isCancelledTurn, type HeardReport, type HeardSegment } from '@/lib/orchestrator/turn-types';
import { INITIAL_PRESSURE_TEST } from '@/lib/orchestrator/pressure-test';
import type { DataLinePart } from '@/lib/orchestrator/data-decisions';

const STORES = 'There are 120 stores.';
const LABOR = 'Labor is 22% of revenue.';
const DATA = `${STORES} ${LABOR}`;
const Q = 'Where would you start?';
const parts: DataLinePart[] = [
  { kind: 'release', ids: ['stores_count'], text: STORES },
  { kind: 'release', ids: ['labor_pct'], text: LABOR },
];
const composed: ComposedTurn = { spokenText: `Okay. ${DATA} ${Q}`, question: Q, newReveals: ['stores_count', 'labor_pct'], dataParts: parts };

// A segment heard up to (and including) `upTo`, or in full / not at all.
const seg = (kind: HeardSegment['kind'], text: string, heard: number | 'all' | 'none', extra: Partial<HeardSegment> = {}): HeardSegment => {
  const heardChars = heard === 'all' ? text.length : heard === 'none' ? 0 : heard;
  return {
    kind, text, revealIds: [], exhibitShown: false, heardChars,
    playback: heardChars === 0 ? 'unplayed' : heardChars >= text.length ? 'played' : 'partial', ...extra,
  };
};
const upTo = (text: string, prefix: string) => {
  if (!text.startsWith(prefix)) throw new Error(`"${prefix}" is not a prefix`);
  return prefix.length;
};
const report = (segments: HeardSegment[], interrupted = true): HeardReport => ({ segments, interrupted });

describe('applyHeard without a report (text mode)', () => {
  it('returns the composed turn unchanged', () => {
    const h = applyHeard(null, composed);
    expect(h.savedText).toBe(composed.spokenText);
    expect(h.bookedReveals).toEqual(['stores_count', 'labor_pct']);
    expect(h.droppedReveals).toEqual([]);
    expect(h.questionHeard).toBe(true);
    expect(h.partHeard('refusals')).toBe(true);
  });
});

describe('reveal bookkeeping: booked if any figure of the release was heard (§5.3)', () => {
  const data = (prefix: string) => seg('data', DATA, upTo(DATA, prefix), { revealIds: ['stores_count', 'labor_pct'] });

  it('books a release whose figure was heard even though its sentence was cut', () => {
    const h = applyHeard(report([seg('say', 'Okay.', 'all'), data(`${STORES} Labor is 22%`), seg('tail', Q, 'none')]), composed);
    expect(h.bookedReveals).toEqual(['stores_count', 'labor_pct']);
    expect(h.savedText).toBe(`Okay. ${STORES} Labor is 22%`);
  });

  it('does not book a release cut before its figure; the saved line holds no figure of it', () => {
    const h = applyHeard(report([seg('say', 'Okay.', 'all'), data(`${STORES} Labor is`), seg('tail', Q, 'none')]), composed);
    expect(h.bookedReveals).toEqual(['stores_count']);
    expect(h.droppedReveals).toEqual(['labor_pct']);
    expect(h.savedText).not.toMatch(/22/);
  });

  it('books a release with no figure only when its whole sentence was heard', () => {
    const qual = 'Menu prices were flat.';
    const c: ComposedTurn = { ...composed, newReveals: ['menu_price_change'], dataParts: [{ kind: 'release', ids: ['menu_price_change'], text: qual }] };
    const cut = applyHeard(report([seg('data', qual, upTo(qual, 'Menu prices were'), { revealIds: ['menu_price_change'] })]), c);
    expect(cut.bookedReveals).toEqual([]);
    const full = applyHeard(report([seg('data', qual, 'all', { revealIds: ['menu_price_change'] })], false), c);
    expect(full.bookedReveals).toEqual(['menu_price_change']);
  });

  it('finds a release that Settle sent in the tail', () => {
    const tail = `${LABOR} ${Q}`;
    const c: ComposedTurn = { ...composed, newReveals: ['labor_pct'], dataParts: [parts[1]] };
    const h = applyHeard(report([seg('tail', tail, upTo(tail, 'Labor is 22%'), { revealIds: ['labor_pct'] })]), c);
    expect(h.bookedReveals).toEqual(['labor_pct']);
    expect(h.questionHeard).toBe(false);
  });
});

describe('refusal / deferral / offer lines count only when heard in full', () => {
  const refusal = "I don't have store-level margins.";
  const c: ComposedTurn = { ...composed, newReveals: [], dataParts: [{ kind: 'refusals', ids: [], text: refusal }] };
  it('is heard in full or not at all', () => {
    expect(applyHeard(report([seg('data', refusal, 'all')], false), c).partHeard('refusals')).toBe(true);
    expect(applyHeard(report([seg('data', refusal, upTo(refusal, "I don't have"))]), c).partHeard('refusals')).toBe(false);
  });
});

describe('exhibits are booked only on browser confirmation (§5.3)', () => {
  const line = "Here's an exhibit: Cost structure.";
  const c: ComposedTurn = { ...composed, newReveals: [], dataParts: [{ kind: 'exhibit', ids: ['exhibit-a'], text: line }], exhibitId: 'exhibit-a' };
  it('is not booked when its segment played but the browser never confirmed it', () => {
    expect(applyHeard(report([seg('data', line, 'all', { exhibitId: 'exhibit-a' })], false), c).exhibitBooked).toBe(false);
  });
  it('is booked when confirmed, even if the audio was cut', () => {
    expect(applyHeard(report([seg('data', line, 5, { exhibitId: 'exhibit-a', exhibitShown: true })]), c).exhibitBooked).toBe(true);
  });
});

describe('the question', () => {
  it('is heard only in full', () => {
    expect(applyHeard(report([seg('tail', Q, 'all')], false), composed).questionHeard).toBe(true);
    expect(applyHeard(report([seg('tail', Q, upTo(Q, 'Where would you'))]), composed).questionHeard).toBe(false);
  });
  it('an empty question counts as heard', () => {
    expect(applyHeard(report([seg('say', 'Okay.', 'all')], false), { ...composed, question: '' }).questionHeard).toBe(true);
  });
  it('heardContains matches on the saved text, ignoring case and spacing', () => {
    const h = applyHeard(report([seg('tail', Q, 'all')], false), composed);
    expect(h.heardContains('where would  YOU start?')).toBe(true);
    expect(h.heardContains('something else')).toBe(false);
  });
});

describe('heardRequestRows', () => {
  const rows = [
    { what: 'store count', ledgerItemIds: ['stores_count'], response: 'release' as const, explicit: true },
    { what: 'labor', ledgerItemIds: ['labor_pct'], response: 'release' as const, explicit: true },
    { what: 'margins', ledgerItemIds: [], response: 'refuse' as const, explicit: true },
    { what: 'menu prices', ledgerItemIds: ['menu_price_change'], response: 'defer' as const, explicit: true },
  ];
  it('marks unheard answers as none and keeps what was said in unheardResponse', () => {
    const c: ComposedTurn = {
      ...composed,
      dataParts: [...parts, { kind: 'refusals', ids: [], text: "I don't have margins." }, { kind: 'defers', ids: [], text: "I'll come back to menu prices shortly." }],
    };
    const data = `${DATA} I don't have margins. I'll come back to menu prices shortly.`;
    const h = applyHeard(report([seg('data', data, upTo(data, `${STORES} Labor is`), { revealIds: ['stores_count', 'labor_pct'] })]), c);
    expect(heardRequestRows(rows, h).map(r => [r.response, r.unheardResponse])).toEqual([
      ['release', undefined], ['none', 'release'], ['none', 'refuse'], ['none', 'defer'],
    ]);
  });
  it('is the identity without a report', () => {
    expect(heardRequestRows(rows, applyHeard(null, composed))).toEqual(rows);
  });
});

describe('unheardQuestionPressureTest', () => {
  const prev = { ...INITIAL_PRESSURE_TEST, gatedTurns: 1 };
  it('undoes an ask and keeps what the reply decided', () => {
    const next = { ...prev, state: 'awaiting' as const, askedAt: 5, probe: 'Is that MECE?', intents: ['mece' as const], codeAsked: true, gatedTurns: 2, structureGiven: true };
    expect(unheardQuestionPressureTest(prev, next)).toEqual({ ...prev, gatedTurns: 2, structureGiven: true });
  });
  it('keeps a satisfaction decided by the reply', () => {
    const awaiting = { ...prev, state: 'awaiting' as const, askedAt: 3 };
    const satisfied = { ...awaiting, state: 'satisfied' as const, satisfiedAt: 4 };
    expect(unheardQuestionPressureTest(awaiting, satisfied)).toEqual(satisfied);
  });
});

describe('isCancelledTurn', () => {
  it('is a cut before anything of the turn was heard or shown', () => {
    expect(isCancelledTurn(report([seg('say', 'Okay.', 'none')]))).toBe(true);
    expect(isCancelledTurn(report([]))).toBe(true);
    expect(isCancelledTurn(report([seg('say', 'Okay.', 2)]))).toBe(false);
    expect(isCancelledTurn(report([seg('data', '', 'none', { exhibitId: 'exhibit-a', exhibitShown: true })]))).toBe(false);
    expect(isCancelledTurn(report([seg('say', 'Okay.', 'none')], false))).toBe(false);
  });
});
