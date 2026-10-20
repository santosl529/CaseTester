import { describe, it, expect } from 'vitest';
import {
  parseDataRequestResponse, buildDataRequestPrompt, toDataRequestEvents,
  formatOpenRequestsHint, planForcedReleases,
  classifiedMarkerEvent, findUnclassifiedExchanges,
  buildAskCheckPrompt, parseAskCheckResponse, askCheckCatalog, maskFigures, askCheckPrefill, withAskPrefill,
  type LedgerCatalogItem, type AskCheckItem,
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
import { getCaseById } from '@/lib/cases/loader';

const gap = (ledgerItemId: string, label: string, turnIndex: number, what = 'asked') =>
  ({ ledgerItemId, label, what, turnIndex });

describe('formatOpenRequestsHint (Rule 11 deferral tracking)', () => {
  it('returns undefined when nothing is open', () => {
    expect(formatOpenRequestsHint([])).toBeUndefined();
  });

  it('lists open requests by label and ask, to be declared for release once earned', () => {
    const hint = formatOpenRequestsHint([gap('avg_ticket', 'Average transaction value', 4, 'menu price history')])!;
    expect(hint).toContain('OPEN DATA REQUESTS');
    expect(hint).toContain('Average transaction value');
    expect(hint).toContain('menu price history');
    expect(hint).toContain('turn 4');
    expect(hint).toContain('respond "release"');
    expect(hint).toContain('before it asks for the recommendation');
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
      { what: 'menu price history', ledgerItemIds: ['avg_ticket'], response: 'none', explicit: true },
      { what: 'store-level concentration', ledgerItemIds: [], response: 'refuse', explicit: true },
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
      { what: 'bean costs', ledgerItemIds: [], response: 'defer', explicit: true },
    ]);
  });

  it('returns null on garbage (fail open: no events, never blocks a turn)', () => {
    expect(parseDataRequestResponse('not json', catalog)).toBeNull();
    expect(parseDataRequestResponse('{"nope":1}', catalog)).toBeNull();
  });
});

// Batch 6 (Maya): "I'd check revenue first — price and cups" was classified
// as a request and the average ticket released unasked. Each request is now
// marked explicit (a direct ask) or a passing mention; a mention gets an offer,
// never a release.
describe('explicit vs mention', () => {
  it('parses the explicit flag, defaulting to explicit when absent', () => {
    const raw = JSON.stringify({ requests: [
      { what: 'price and cups', ledgerItemIds: ['avg_ticket'], response: 'none', explicit: false },
      { what: 'bean costs', ledgerItemIds: ['bean_price_change'], response: 'none' },
    ] });
    expect(parseDataRequestResponse(raw, catalog)?.map(r => r.explicit)).toEqual([false, true]);
  });

  it('asks the classifier to separate direct asks from passing mentions', () => {
    const prompt = buildDataRequestPrompt("I'd check revenue first — price and cups.", null, catalog);
    expect(prompt).toMatch(/"explicit"/);
    expect(prompt).toMatch(/passing mention/i);
  });

  it('carries the flag into the logged event', () => {
    const [e] = toDataRequestEvents(
      [{ what: 'price and cups', ledgerItemIds: ['avg_ticket'], response: 'none', explicit: false }],
      { candidateTurnIndex: 3, interviewerTurnIndex: 4, revealedIds: new Set() },
    );
    expect(e.payload.explicit).toBe(false);
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
        { what: 'menu price history', ledgerItemIds: ['avg_ticket'], response: 'none', explicit: true },
        { what: 'store concentration', ledgerItemIds: [], response: 'refuse', explicit: true },
      ],
      { candidateTurnIndex: 12, interviewerTurnIndex: 13, revealedIds: new Set(['bean_price_change']) },
    );
    expect(events).toEqual([
      {
        category: 'data_request', subtype: 'none', turnIndex: 12,
        payload: { what: 'menu price history', ledgerItemIds: ['avg_ticket'], interviewerTurnIndex: 13, revealedByNow: false, explicit: true },
      },
      {
        category: 'data_request', subtype: 'refuse', turnIndex: 12,
        payload: { what: 'store concentration', ledgerItemIds: [], interviewerTurnIndex: 13, revealedByNow: false, explicit: true },
      },
    ]);
  });

  it('revealedByNow only when every covered ledger item has been released', () => {
    const request = [{ what: 'cost detail', ledgerItemIds: ['avg_ticket', 'bean_price_change'], response: 'release' as const, explicit: true }];
    const ctx = { candidateTurnIndex: 4, interviewerTurnIndex: 5 };
    expect(toDataRequestEvents(request, { ...ctx, revealedIds: new Set(['avg_ticket']) })[0].payload.revealedByNow).toBe(false);
    expect(toDataRequestEvents(request, { ...ctx, revealedIds: new Set(['avg_ticket', 'bean_price_change']) })[0].payload.revealedByNow).toBe(true);
  });
});

// Round 5b Task 56 (Lorenzo, 20 Oct, job 3): the item-less ask check gets its own
// prompt — the item(s) that hold the answer, and per item whether its line answers
// the ask in full or only holds the nearest data (`partial`, with the asked part it
// lacks). The check sees each item's label and its line with every figure masked.
describe('the ask check (classifyAsk): catalog, prompt and parser', () => {
  const CASES = ['prof-001', 'prof-002', 'entry-001', 'launch-001', 'pricing-001'];
  const NUMBER_WORDS = /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|half|twice|double)\b/i;

  it('masks every figure in each item\'s line: digits and spelled-out amounts', () => {
    expect(maskFigures('Raw coffee bean costs are up 40% over the past two years.')).toBe('Raw coffee bean costs are up #% over the past # years.');
    expect(maskFigures('Aldermoor has about $1.5 billion in annual revenue, almost all in Europe, and it has no US employees or sales force today.'))
      .toBe('Aldermoor has about $# # in annual revenue, almost all in Europe, and it has no US employees or sales force today.');
    expect(maskFigures('Hub–Cedar Bluff (2,500 flights) went from $38.0M to $37.5M')).toBe('Hub–Cedar Bluff (# flights) went from $#M to $#M');
    for (const id of CASES) for (const item of askCheckCatalog(getCaseById(id).dataLedger)) {
      expect(item.line, `${id}/${item.id}`).not.toMatch(/\d/);
      expect(item.line, `${id}/${item.id}`).not.toMatch(NUMBER_WORDS);
    }
  });

  it('the catalog is the check\'s: id, the label with its period, the masked line', () => {
    const cat = askCheckCatalog(getCaseById('prof-001').dataLedger);
    expect(cat.find(c => c.id === 'bean_share_of_cogs')).toEqual({
      id: 'bean_share_of_cogs', label: "Composition of COGS: coffee beans' share of COGS (covers the prior period)", line: 'Coffee beans were #% of COGS # years ago.',
    });
  });

  it('the prompt lists every catalog id with its label and masked line; no figure of any value reaches it', () => {
    for (const id of CASES) {
      const c = getCaseById(id);
      const catalog = askCheckCatalog(c.dataLedger);
      const what = 'the cost breakdown by region';
      const prompt = buildAskCheckPrompt(what, catalog);
      for (const item of catalog) expect(prompt).toContain(`- ${item.id}: ${item.label} — ${item.line}`);
      // Labels and the ask are the classifier's input already (some labels carry a digit: "over 2 years").
      let rest = prompt.replace(what, '');
      for (const item of catalog) rest = rest.replace(item.label, '');
      expect(rest, id).not.toMatch(/\d/);
      // A line with a figure never goes in whole (a line without one, a definition, is its own masked line).
      for (const item of c.dataLedger) if (/\d/.test(item.value)) expect(prompt).not.toContain(item.value);
    }
  });

  it('the prompt states the rules: the item that holds the answer, full or partial, the missing part in the ask\'s words, and the examples', () => {
    const prompt = buildAskCheckPrompt('Starter cohort beyond month 12', askCheckCatalog(getCaseById('pricing-001').dataLedger));
    expect(prompt).toContain('"Starter cohort beyond month 12"');
    expect(prompt).toMatch(/hold the answer to what was asked/);
    expect(prompt).toMatch(/same topic that doesn't hold it is no mapping/);
    expect(prompt).toMatch(/"answers": "full"/);
    expect(prompt).toMatch(/"partial"/);
    expect(prompt).toMatch(/"missing"/);
    expect(prompt).toMatch(/in the ask's own words, no numbers/);
    for (const ex of ['option_b', 'company_size', 'cohort_notes', 'starter_cohort', 'upgrade_timing', 'cogs_pct', 'labor_pct', 'overhead_pct']) expect(prompt).toContain(ex);
  });

  const cat: AskCheckItem[] = [
    { id: 'bean_share_of_cogs', label: "Composition of COGS: coffee beans' share of COGS (covers the prior period)", line: 'Coffee beans were #% of COGS # years ago.' },
    { id: 'cogs_pct', label: 'COGS as % of revenue', line: 'COGS is #% of revenue today, up from #% # years ago.' },
  ];
  const WHAT = 'coffee beans as a share of COGS today';
  const parse = (o: unknown, what = WHAT) => parseAskCheckResponse(JSON.stringify(o), what, cat);

  it('parses items; ids outside the catalog are dropped; a repeated id kept once', () => {
    expect(parse({ items: [{ id: 'cogs_pct', answers: 'full' }, { id: 'made_up', answers: 'full' }, { id: 'cogs_pct', answers: 'partial', missing: 'today' }] }))
      .toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    expect(parse({ items: [] })).toEqual({ items: [] });
  });
  it('`answers` missing or unknown → full', () => {
    expect(parse({ items: [{ id: 'cogs_pct' }, { id: 'bean_share_of_cogs', answers: 'mostly' }] }))
      .toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }, { id: 'bean_share_of_cogs', answers: 'full' }] });
  });
  it('a partial keeps its `missing` when it has no digit and every content word is the ask\'s', () => {
    expect(parse({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: "coffee beans' share of COGS today" }] }))
      .toEqual({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: "coffee beans' share of COGS today" }] });
  });
  it('`missing` with a digit, a content word not in the ask, or none at all → the ask\'s own words', () => {
    for (const missing of ['the 2025 bean share', "today's bean share at 58%", 'the current-period bean share', 'bean share by region', '', undefined]) {
      expect(parse({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', ...(missing === undefined ? {} : { missing }) }] }), String(missing))
        .toEqual({ items: [{ id: 'bean_share_of_cogs', answers: 'partial', missing: WHAT }] });
    }
  });
  it('a full item carries no `missing`', () => {
    expect(parse({ items: [{ id: 'cogs_pct', answers: 'full', missing: 'today' }] })).toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
  });
  it('null on garbage or a reply without items; code fences stripped', () => {
    expect(parseAskCheckResponse('not json', WHAT, cat)).toBeNull();
    expect(parse({ requests: [] })).toBeNull();
    expect(parseAskCheckResponse('```json\n{"items":[{"id":"cogs_pct","answers":"full"}]}\n```', WHAT, cat)).toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
  });
});

// Task 56 fix round 1 (the paid Haiku rerun, 20 Oct): 16 of 68 replies from
// claude-haiku-4-5 (no structured output) wrapped the JSON in prose, so the parse
// failed → no verdict → a hollow named deferral. The reply is prefilled with
// ASK_CHECK_PREFILL on models without a JSON schema, and the parser reads the first
// balanced JSON object out of any prose around it.
describe('the ask check reply: prose around the JSON, and the prefill', () => {
  const cat: AskCheckItem[] = [{ id: 'cogs_pct', label: 'COGS as % of revenue', line: 'COGS is #% of revenue today.' }];
  it('a prose-wrapped reply parses', () => {
    expect(parseAskCheckResponse('No item in the catalog holds competitor pricing.\n{"items":[]}', 'competitor pricing', cat)).toEqual({ items: [] });
    expect(parseAskCheckResponse('Looking at the catalog, {"items":[{"id":"cogs_pct","answers":"full"}]} is my answer — the {COGS} line holds it.', 'COGS', cat))
      .toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    // A brace inside a string doesn't end the object early.
    expect(parseAskCheckResponse('Here: {"items":[{"id":"cogs_pct","answers":"partial","missing":"COGS } today"}]}', 'COGS today', cat))
      .toEqual({ items: [{ id: 'cogs_pct', answers: 'partial', missing: 'COGS } today' }] });
  });
  it('a prefilled reply, put back together with the prefill, parses (prose after it too)', () => {
    expect(parseAskCheckResponse(withAskPrefill('{"id":"cogs_pct","answers":"full"}]}'), 'COGS', cat)).toEqual({ items: [{ id: 'cogs_pct', answers: 'full' }] });
    expect(parseAskCheckResponse(withAskPrefill(']}\n\nNo catalog item covers competitor pricing.'), 'competitor pricing', cat)).toEqual({ items: [] });
  });
  it('a reply with no JSON object, or none with items → null', () => {
    expect(parseAskCheckResponse('No item in the catalog holds competitor pricing.', 'competitor pricing', cat)).toBeNull();
    expect(parseAskCheckResponse('Unbalanced {"items":[', 'x', cat)).toBeNull();
    expect(parseAskCheckResponse('{"note":"none"} and nothing else', 'x', cat)).toBeNull();
  });
  it('the prefill goes only to a model the JSON schema isn\'t applied to (claude-haiku-4-5), never to claude-haiku-5-5', () => {
    expect(askCheckPrefill('claude-haiku-4-5')).toBe('{"items":[');
    expect(askCheckPrefill('claude-haiku-5-5')).toBeNull();
    expect(askCheckPrefill('claude-sonnet-5-5')).toBeNull();
  });
});
