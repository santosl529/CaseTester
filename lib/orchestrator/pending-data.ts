// The question is spoken after code's data line (Settle: say, data, question),
// so on a turn that delivered data the candidate has already heard it. Batch
// 19 (Haiku 5.5, 21 of 24 runs vs 3 of 14 Sonnet runs on the same personas)
// wrote the question as if it hadn't: "Once you have those two figures, how
// much…", "Before those figures come in…", "Menu prices are on their way."
// Such wording is rewritten — "Once you have X, …" → "With X, …" (same
// referent, right tense); "Before we get to X, …" / "Before those land, …"
// dropped; "you're about to hear" → "you just heard" — or, when no clean
// rewrite exists ("…are coming up now"), the sentence is withheld. Wording that names data
// still held this turn (deferred, gated, offered) is true and stays.

const SENTENCE_SPLIT = /(?<=[.?!])\s+/;

// The object is data, not the candidate's own work ("once you have a number",
// "before you rely on that", "before we use that weighted figure" stay out).
const DATA_OBJECT = /(?:them|those|these|that|it|both|(?:the )?(?!(?:a|an|your|my|this|that)\b)(?=\w)[\w&' -]{0,30}?(?:figures?|numbers?|data|prices?|breakdowns?|splits?|history|changes?|shares?|percentages|line items|cost structure|counts?|revenue|exhibit))\b/.source;

// A clause that opens on the data still to come: "Once you have those…",
// "Before we get into the data…", "Before those figures come in…".
const CLAUSE_OPENERS = [
  `\\bonce you(?:'ve)? (?:have|had|got|get|see|seen|read|look at|looked at|hear|heard) ${DATA_OBJECT}`,
  /\bbefore (?:those|these|the|that|they|it)\b[^.?!,:]{0,30}\b(?:come|comes|arrive|arrives|land|lands)(?: in)?\b/.source,
  // "Before those figures, walk me through…" (batch 20 R12 t10, t14).
  /\bbefore (?:those|these|the) (?:figures|numbers|data)(?=\s*[,:—–])/.source,
  `\\bbefore (?:we|you) (?:get to|get into|go into|look at|see|read|dig into) ${DATA_OBJECT}`,
  /\bwhen (?:those|these|they|the \w+) (?:come in|arrive|land)\b/.source,
];
const CLAUSE = new RegExp(CLAUSE_OPENERS.join('|'), 'i');
const ONCE = /^once you(?:'ve)? (?:have|had|got|get|see|seen|read|look at|looked at|hear|heard) /i;
// "…you're about to hear" — fixed in place.
const ABOUT_TO = /\b(?:that )?(?:you'?re|you are) about to (hear|see|get)\b/i;
const PAST: Record<string, string> = { hear: 'heard', see: 'saw', get: 'got' };
// An announcement of data still to come: no rewrite — withheld.
const ANNOUNCEMENT = /\b(?:are|is|'re|'s) on (?:their|its) way\b|\bcoming (?:up|through)(?: now)?\b/i;

export const PENDING_DATA = new RegExp([...CLAUSE_OPENERS, ABOUT_TO.source, ANNOUNCEMENT.source].join('|'), 'i');

export type PendingDataContext = {
  deliveredThisTurn: boolean;   // releases, a restatement or an exhibit went out this turn
  heldWhats: string[];          // what was deferred, gated or offered this turn (still to come)
  releasedTexts: string[];      // what went out: values and labels
};

export type PendingDataResult = {
  question: string | null;      // null: nothing of the question is left; the caller asks another
  changes: { from: string; to: string | null }[];
};

const STOP = new Set(['once', 'have', 'before', 'those', 'these', 'them', 'that', 'with', 'into', 'front', 'hand', 'both', 'come', 'comes', 'land', 'lands', 'arrive', 'about', 'hear', 'your', 'their', 'they', 'look', 'read', 'when', 'what', 'figure', 'number', 'data', 'over', 'years', 'year', 'two', 'from', 'this', 'the']);
function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z][a-z-]+/g)?.map(w => w.replace(/s$/, '')).filter(w => w.length >= 4 && !STOP.has(w)) ?? []);
}

// The clause names something held this turn and nothing that went out.
function namesHeld(clause: string, c: PendingDataContext): boolean {
  const named = words(clause);
  const held = words(c.heldWhats.join(' '));
  const out = words(c.releasedTexts.join(' '));
  return [...named].some(w => held.has(w)) && ![...named].some(w => out.has(w));
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function rewriteSentence(s: string, c: PendingDataContext): string | null | undefined {
  const about = ABOUT_TO.exec(s);
  if (about) return s.replace(ABOUT_TO, `you just ${PAST[about[1].toLowerCase()]}`);
  const m = CLAUSE.exec(s);
  if (m) {
    // "Once you have those figures, …" → "With those figures, …": the same
    // referent, the right tense.
    const once = ONCE.exec(m[0]);
    if (once && once.index === 0) {
      const clauseEnd = m.index === 0 ? /[,:—–]/.exec(s)?.index ?? s.length : s.length;
      if (namesHeld(s.slice(m.index, clauseEnd), c)) return undefined;
      return s.slice(0, m.index) + (m.index === 0 ? 'With ' : 'with ') + s.slice(m.index + once[0].length);
    }
    // Leading clause: up to the first comma, colon or dash.
    if (m.index === 0) {
      const end = /[,:—–]\s*/.exec(s.slice(m[0].length));
      if (!end) return null;
      const clause = s.slice(0, m[0].length + end.index);
      if (namesHeld(clause, c)) return undefined;
      return capitalize(s.slice(m[0].length + end.index + end[0].length));
    }
    // Trailing clause: from the opener to the sentence's end.
    const rest = s.slice(m.index);
    if (/^[^,:;—–]*[.?!]$/.test(rest)) {
      if (namesHeld(rest, c)) return undefined;
      return s.slice(0, m.index).replace(/[,\s]+$/, '') + rest.slice(-1);
    }
    return null;
  }
  if (ANNOUNCEMENT.test(s)) return namesHeld(s, c) ? undefined : null;
  return undefined;
}

export function settlePendingData(question: string, c: PendingDataContext): PendingDataResult {
  if (!c.deliveredThisTurn || !PENDING_DATA.test(question)) return { question, changes: [] };
  const changes: PendingDataResult['changes'] = [];
  const kept: string[] = [];
  for (const s of question.trim().split(SENTENCE_SPLIT).filter(Boolean)) {
    const r = rewriteSentence(s, c);
    if (r === undefined) { kept.push(s); continue; }
    changes.push({ from: s, to: r });
    if (r) kept.push(r);
  }
  if (changes.length === 0) return { question, changes };
  return { question: kept.length > 0 ? kept.join(' ') : null, changes };
}
