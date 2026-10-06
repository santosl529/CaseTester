// The interviewer's turn (spec 2026-10-06-plan-owns-decisions §4): two
// declarations code acts on — what the candidate asked for, and what the
// model's own question does — then the words. Release, refusal, deferral,
// exhibits, phase and ending are decided and rendered by code (plan-turn.ts,
// data-decisions.ts); the model never writes a data line. Fields are in the
// order the stream needs them: declarations close before any speech streams.

export const MOVES = [
  'clarify', 'structure', 'pressure_test', 'analysis', 'exhibit', 'brainstorm', 'risk', 'recommendation', 'other',
] as const;
export type Move = (typeof MOVES)[number];

export type DeclaredRequest = {
  what: string;        // the information asked for, in a few words ("transaction volume by store")
  itemIds: string[];   // case data items and exhibits that cover it; [] when the case doesn't have it
  explicit: boolean;   // a direct ask (true) or a passing mention (false)
  respond: 'release' | 'defer';
};

export type ModelTurn = {
  move: Move;
  requests: DeclaredRequest[];
  exhibit: string | null;     // an exhibit the model hands over this turn
  rescueItem: string | null;  // stall rung 3 only: the data item that moves the case forward
  say: string;                // spoken before any data
  question: string;           // the one question that ends the turn
};

const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] };

// Fixed schema (ids are plain strings, validated in code): a new schema is
// compiled on first use and cached for 24h, so it must not change per turn.
export const TURN_SCHEMA = {
  type: 'object',
  properties: {
    move: { type: 'string', enum: [...MOVES] },
    requests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          what: { type: 'string' },
          item_ids: { type: 'array', items: { type: 'string' } },
          explicit: { type: 'boolean' },
          respond: { type: 'string', enum: ['release', 'defer'] },
        },
        required: ['what', 'item_ids', 'explicit', 'respond'],
        additionalProperties: false,
      },
    },
    exhibit: NULLABLE_STRING,
    rescue_item: NULLABLE_STRING,
    say: { type: 'string' },
    question: { type: 'string' },
  },
  required: ['move', 'requests', 'exhibit', 'rescue_item', 'say', 'question'],
  additionalProperties: false,
};

// The raw requests array as it appears in the JSON → typed requests.
export function toRequests(raw: unknown): DeclaredRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: DeclaredRequest[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.what !== 'string' || !o.what.trim()) continue;
    out.push({
      what: o.what.trim(),
      itemIds: Array.isArray(o.item_ids) ? o.item_ids.filter((x): x is string => typeof x === 'string') : [],
      explicit: o.explicit !== false,
      respond: o.respond === 'defer' ? 'defer' : 'release',
    });
  }
  return out;
}

const nullableString = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function toModelTurn(raw: unknown): ModelTurn | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.say !== 'string' || typeof o.question !== 'string') return null;
  return {
    move: (MOVES as readonly string[]).includes(o.move as string) ? (o.move as Move) : 'other',
    requests: toRequests(o.requests),
    exhibit: nullableString(o.exhibit),
    rescueItem: nullableString(o.rescue_item),
    say: o.say.trim(),
    question: o.question.trim(),
  };
}

export function parseTurn(text: string): ModelTurn | null {
  try {
    return toModelTurn(JSON.parse(text));
  } catch {
    return null;
  }
}

// Ids the model named that the case doesn't have (after tolerant resolution
// by the caller's resolver). A typo'd id would otherwise become a refusal
// ("I don't have …") for data the case does hold, so it triggers one
// regeneration while nothing has been delivered.
export function unknownIds(
  requests: DeclaredRequest[],
  resolve: (id: string) => string | null,
): string[] {
  return requests.flatMap(r => r.itemIds).filter(id => resolve(id) === null);
}

// Ids resolved to canonical ones; unknown ids dropped.
export function resolveRequests(
  requests: DeclaredRequest[],
  resolve: (id: string) => string | null,
): DeclaredRequest[] {
  return requests.map(r => ({
    ...r,
    itemIds: [...new Set(r.itemIds.map(resolve).filter((x): x is string => x !== null))],
  }));
}
