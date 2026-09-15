import { describe, it, expect } from 'vitest';
import {
  parseDataRequestResponse, buildDataRequestPrompt, toDataRequestEvents,
  formatOpenRequestsHint, planForcedReleases, composeForcedReleaseTurn,
  classifiedMarkerEvent, findUnclassifiedExchanges,
  type LedgerCatalogItem,
} from '@/lib/orchestrator/data-requests';

describe('classifiedMarkerEvent (classified-empty vs never-classified)', () => {
  it('marks an exchange as classified with its request count, so zero requests still leaves a trace', () => {
    expect(classifiedMarkerEvent({ candidateTurnIndex: 4, interviewerTurnIndex: 5, requestCount: 0 })).toEqual({
      category: 'data_request', subtype: 'classified', turnIndex: 4,
      payload: { interviewerTurnIndex: 5, requestCount: 0 },
    });
  });
});

describe('findUnclassifiedExchanges (scoring-time backfill)', () => {
  const t = (turnIndex: number, role: string, text = `turn ${turnIndex}`) => ({ turnIndex, role, text });
  const transcript = [
    t(0, 'interviewer'), t(1, 'candidate'), t(2, 'interviewer'),
    t(3, 'candidate'), t(4, 'interviewer'), t(5, 'candidate'), t(6, 'interviewer'),
  ];

  it('returns candidate→interviewer exchanges whose candidate turn has no data_request rows', () => {
    const rows = [
      { subtype: 'classified', turnIndex: 1 },
      { subtype: 'none', turnIndex: 5 }, // pre-marker session rows also count as classified
    ];
    expect(findUnclassifiedExchanges(transcript, rows)).toEqual([
      { candidate: t(3, 'candidate'), interviewer: t(4, 'interviewer') },
    ]);
  });

  it('skips a trailing candidate turn with no interviewer reply', () => {
    expect(findUnclassifiedExchanges([...transcript, t(7, 'candidate')], [
      { subtype: 'classified', turnIndex: 1 }, { subtype: 'classified', turnIndex: 3 }, { subtype: 'classified', turnIndex: 5 },
    ])).toEqual([]);
  });
});
import { FORCED_RELEASE_LEADINS, alreadySignaledTimeOrRec } from '@/lib/agent/prompts/scripts';
import { getCaseById } from '@/lib/cases/loader';

const gap = (ledgerItemId: string, label: string, turnIndex: number, what = 'asked') =>
  ({ ledgerItemId, label, what, turnIndex });

describe('formatOpenRequestsHint (Rule 11 deferral tracking)', () => {
  it('returns undefined when nothing is open', () => {
    expect(formatOpenRequestsHint([])).toBeUndefined();
  });

  it('lists open requests by label and ask, and requires release before the recommendation ask', () => {
    const hint = formatOpenRequestsHint([gap('avg_ticket', 'Average transaction value', 4, 'menu price history')])!;
    expect(hint).toContain('OPEN DATA REQUESTS');
    expect(hint).toContain('Average transaction value');
    expect(hint).toContain('menu price history');
    expect(hint).toContain('turn 4');
    expect(hint).toContain('BEFORE you ask for the recommendation');
  });
});

describe('planForcedReleases', () => {
  it('releases what the candidate asked for THIS turn first (live run eca39ec7: store count beat the COGS split just asked for)', () => {
    const gaps = [
      gap('stores_count', 'S', 3), gap('revenue_per_store', 'R', 3),
      gap('bean_share_of_cogs', 'B', 5), gap('non_bean_input_change', 'N', 5),
    ];
    expect(planForcedReleases(gaps, new Set(), { currentTurnIndex: 5 })).toEqual(['bean_share_of_cogs', 'non_bean_input_change']);
  });

  it('otherwise the most recent requests first, skipping anything already revealed, capped', () => {
    const gaps = [
      gap('c', 'C', 9), gap('a', 'A', 2), gap('b', 'B', 5), gap('d', 'D', 1),
    ];
    expect(planForcedReleases(gaps, new Set(['c']), { cap: 2 })).toEqual(['b', 'a']);
  });

  it('defaults to a cap of 2 so a wrap-up turn never becomes a data monologue', () => {
    expect(planForcedReleases([gap('a', 'A', 1), gap('b', 'B', 2), gap('c', 'C', 3)], new Set())).toHaveLength(2);
  });
});

describe('composeForcedReleaseTurn (request first, then the recommendation ask)', () => {
  const values = ['The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase.'];
  const leadIn = 'Before we wrap, on what you asked about earlier:';

  it('no forced releases: model text plus the scripted warning, unchanged from before', () => {
    expect(composeForcedReleaseTurn({ spokenText: 'Okay.', releaseValues: [], leadIn, warningLine: "We're near time." }))
      .toBe("Okay. We're near time.");
    expect(composeForcedReleaseTurn({ spokenText: 'Okay.', releaseValues: [], leadIn })).toBe('Okay.');
  });

  it('scripted warning: model text, then the release, then the warning', () => {
    const out = composeForcedReleaseTurn({
      spokenText: 'Understood.', releaseValues: values, leadIn,
      warningLine: "We're near time. What's your bottom-line recommendation to the CEO?",
    });
    expect(out).toBe(`Understood. ${leadIn} ${values[0]} We're near time. What's your bottom-line recommendation to the CEO?`);
  });

  it('model asked itself: the release goes immediately before the sentence that asks', () => {
    const out = composeForcedReleaseTurn({
      spokenText: "Okay. We're nearly out of time, so let's land it. What's your recommendation to the CEO?",
      releaseValues: values, leadIn, isAskSentence: alreadySignaledTimeOrRec,
    });
    expect(out).toBe(`Okay. ${leadIn} ${values[0]} We're nearly out of time, so let's land it. What's your recommendation to the CEO?`);
  });

  it('model asked but no single sentence matches: release goes first', () => {
    const out = composeForcedReleaseTurn({
      spokenText: 'Land it for me.', releaseValues: values, leadIn, isAskSentence: () => false,
    });
    expect(out).toBe(`${leadIn} ${values[0]} Land it for me.`);
  });
});

describe('FORCED_RELEASE_LEADINS', () => {
  it('is a rotating pool (Rule 7 anti-tell) with no numerals (Rule 6 provenance)', () => {
    expect(FORCED_RELEASE_LEADINS.length).toBeGreaterThanOrEqual(3);
    for (const line of FORCED_RELEASE_LEADINS) expect(line).not.toMatch(/\d/);
  });
});

const catalog: LedgerCatalogItem[] = [
  { id: 'avg_ticket', label: 'Average transaction value' },
  { id: 'bean_price_change', label: 'Coffee bean price change over 2 years' },
];

describe('parseDataRequestResponse', () => {
  it('parses detected requests with their ledger ids and response type', () => {
    const raw = JSON.stringify({
      requests: [
        { what: 'menu price history', ledgerItemIds: ['avg_ticket'], response: 'none' },
        { what: 'store-level concentration', ledgerItemIds: [], response: 'refuse' },
      ],
    });
    expect(parseDataRequestResponse(raw, catalog)).toEqual([
      { what: 'menu price history', ledgerItemIds: ['avg_ticket'], response: 'none' },
      { what: 'store-level concentration', ledgerItemIds: [], response: 'refuse' },
    ]);
  });

  it('one request can cover several ledger items, deduped in order (live run 58cb8061: a COGS component split)', () => {
    const raw = '{"requests":[{"what":"COGS broken into its components","ledgerItemIds":["bean_price_change","avg_ticket","bean_price_change"],"response":"none"}]}';
    expect(parseDataRequestResponse(raw, catalog)?.[0].ledgerItemIds).toEqual(['bean_price_change', 'avg_ticket']);
  });

  it('accepts the legacy single ledgerItemId field', () => {
    const one = '{"requests":[{"what":"bean costs","ledgerItemId":"bean_price_change","response":"release"}]}';
    expect(parseDataRequestResponse(one, catalog)?.[0].ledgerItemIds).toEqual(['bean_price_change']);
    const none = '{"requests":[{"what":"store data","ledgerItemId":null,"response":"refuse"}]}';
    expect(parseDataRequestResponse(none, catalog)?.[0].ledgerItemIds).toEqual([]);
  });

  it('returns an empty list when the turn contains no request', () => {
    expect(parseDataRequestResponse('{"requests":[]}', catalog)).toEqual([]);
  });

  it('strips code fences', () => {
    const raw = '```json\n{"requests":[{"what":"bean costs","ledgerItemIds":["bean_price_change"],"response":"release"}]}\n```';
    expect(parseDataRequestResponse(raw, catalog)?.[0].ledgerItemIds).toEqual(['bean_price_change']);
  });

  it('closed catalog: ids not in the ledger are dropped, never trusted', () => {
    const raw = '{"requests":[{"what":"vintage split","ledgerItemIds":["vintage_split","avg_ticket"],"response":"none"}]}';
    expect(parseDataRequestResponse(raw, catalog)?.[0].ledgerItemIds).toEqual(['avg_ticket']);
  });

  it('coerces an unknown response type to "none" (unanswered is the safe default)', () => {
    const raw = '{"requests":[{"what":"bean costs","ledgerItemIds":["bean_price_change"],"response":"sort of"}]}';
    expect(parseDataRequestResponse(raw, catalog)?.[0].response).toBe('none');
  });

  it('skips malformed entries but keeps valid ones', () => {
    const raw = '{"requests":[{"ledgerItemIds":["avg_ticket"]},{"what":"bean costs","ledgerItemIds":[],"response":"defer"}]}';
    expect(parseDataRequestResponse(raw, catalog)).toEqual([
      { what: 'bean costs', ledgerItemIds: [], response: 'defer' },
    ]);
  });

  it('returns null on garbage (fail open: no events, never blocks a turn)', () => {
    expect(parseDataRequestResponse('not json', catalog)).toBeNull();
    expect(parseDataRequestResponse('{"nope":1}', catalog)).toBeNull();
  });
});

describe('buildDataRequestPrompt', () => {
  const c = getCaseById('prof-001');
  const fullCatalog = c.dataLedger.map(d => ({ id: d.id, label: d.label }));

  it('includes ledger ids, labels, and both turns', () => {
    const prompt = buildDataRequestPrompt('What happened to menu prices?', "We're near time.", fullCatalog);
    expect(prompt).toContain('avg_ticket');
    expect(prompt).toContain('Average transaction value');
    expect(prompt).toContain('What happened to menu prices?');
    expect(prompt).toContain("We're near time.");
  });

  it('tells the classifier that stating or restating a figure is not a request (live run db41a01e)', () => {
    const prompt = buildDataRequestPrompt('COGS is 58% of revenue, so a 5% cut is 2.9 points.', 'Walk me through that.', fullCatalog);
    expect(prompt).toContain('stating or restating a figure');
  });

  it('never contains ledger VALUES (FR-4: values are server-only and reveal-gated)', () => {
    const prompt = buildDataRequestPrompt('Any data on costs?', 'Walk me through that.', fullCatalog);
    for (const item of c.dataLedger) {
      expect(prompt).not.toContain(item.value);
    }
  });
});

describe('toDataRequestEvents', () => {
  it('maps requests to data_request session events keyed to the candidate turn', () => {
    const events = toDataRequestEvents(
      [
        { what: 'menu price history', ledgerItemIds: ['avg_ticket'], response: 'none' },
        { what: 'store concentration', ledgerItemIds: [], response: 'refuse' },
      ],
      { candidateTurnIndex: 12, interviewerTurnIndex: 13, revealedIds: new Set(['bean_price_change']) },
    );
    expect(events).toEqual([
      {
        category: 'data_request', subtype: 'none', turnIndex: 12,
        payload: { what: 'menu price history', ledgerItemIds: ['avg_ticket'], interviewerTurnIndex: 13, revealedByNow: false },
      },
      {
        category: 'data_request', subtype: 'refuse', turnIndex: 12,
        payload: { what: 'store concentration', ledgerItemIds: [], interviewerTurnIndex: 13, revealedByNow: false },
      },
    ]);
  });

  it('revealedByNow only when every covered ledger item has been released', () => {
    const request = [{ what: 'cost detail', ledgerItemIds: ['avg_ticket', 'bean_price_change'], response: 'release' as const }];
    const ctx = { candidateTurnIndex: 4, interviewerTurnIndex: 5 };
    expect(toDataRequestEvents(request, { ...ctx, revealedIds: new Set(['avg_ticket']) })[0].payload.revealedByNow).toBe(false);
    expect(toDataRequestEvents(request, { ...ctx, revealedIds: new Set(['avg_ticket', 'bean_price_change']) })[0].payload.revealedByNow).toBe(true);
  });
});
