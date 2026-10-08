// What the candidate heard of a voice turn, applied to the turn Settle
// composed (spec 2026-10-08-voice-phase-b §5.3–5.4). Pure. Text mode passes
// no report and gets the composed turn back unchanged.
//
// One invariant: every case figure in the saved line belongs to a booked
// ledger item. A release is booked when any figure of its sentence was heard
// (or, with no figure, the whole sentence); the saved line is the heard text,
// so it never holds a figure of a release that wasn't booked.
import type { HeardReport, HeardSegment } from './turn-types';
import type { PressureTestState } from './pressure-test';
import type { DataLinePart } from './data-decisions';
import type { DetectedDataRequest } from './data-requests';

export type ComposedTurn = {
  spokenText: string;          // the composed turn (what text mode saves)
  question: string;            // its question ('' when it has none)
  newReveals: string[];        // releases decided and handed to delivery
  dataParts: DataLinePart[];   // the data line, sentence by sentence
  exhibitId?: string;
};

export type HeardOutcome = {
  savedText: string;           // the turn as heard, without the acknowledgment
  bookedReveals: string[];
  droppedReveals: string[];
  exhibitBooked: boolean;      // the browser confirmed it rendered
  questionHeard: boolean;      // the question was heard in full
  partHeard: (kind: 'refusals' | 'defers' | 'offers') => boolean;
  heardContains: (span: string | null | undefined) => boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const FIGURE = /\d[\d,]*(?:\.\d+)?/g;

// Where `text` sits in the turn's segments (those carrying `id` first).
function locate(report: HeardReport, text: string, id?: string): { seg: HeardSegment; at: number } | null {
  const t = text.trim();
  if (!t) return null;
  const order = id ? [...report.segments.filter(s => s.revealIds.includes(id)), ...report.segments] : report.segments;
  for (const seg of order) {
    const at = seg.text.indexOf(t);
    if (at >= 0) return { seg, at };
  }
  return null;
}

// Heard in full: the sentence's last character is within what was heard.
function wholeHeard(report: HeardReport, text: string, id?: string): boolean {
  const hit = locate(report, text, id);
  return hit !== null && hit.at + text.trim().length <= hit.seg.heardChars;
}

// A release is heard when any of its figures was (else the whole sentence).
function releaseHeard(report: HeardReport, text: string, id: string): boolean {
  const hit = locate(report, text, id);
  if (!hit) return false;
  const t = text.trim();
  const figures = [...t.matchAll(FIGURE)];
  if (figures.length === 0) return hit.at + t.length <= hit.seg.heardChars;
  return figures.some(m => hit.at + m.index! + m[0].length <= hit.seg.heardChars);
}

export function applyHeard(report: HeardReport | null, c: ComposedTurn): HeardOutcome {
  if (!report) {
    return {
      savedText: c.spokenText, bookedReveals: c.newReveals, droppedReveals: [],
      exhibitBooked: c.exhibitId !== undefined, questionHeard: true,
      partHeard: () => true, heardContains: () => true,
    };
  }
  const savedText = report.segments.map(s => s.text.slice(0, s.heardChars).trim()).filter(Boolean).join(' ');
  const heard = norm(savedText);
  const heardContains = (span: string | null | undefined) => !span || heard.includes(norm(span));
  const releaseText = new Map(c.dataParts.filter(p => p.kind === 'release').map(p => [p.ids[0], p.text]));
  const booked = c.newReveals.filter(id => {
    const text = releaseText.get(id);
    return text !== undefined && releaseHeard(report, text, id);
  });
  const question = c.question.trim();
  return {
    savedText,
    bookedReveals: booked,
    droppedReveals: c.newReveals.filter(id => !booked.includes(id)),
    exhibitBooked: c.exhibitId !== undefined && report.segments.some(s => s.exhibitId === c.exhibitId && s.exhibitShown),
    questionHeard: !question || (locate(report, question) ? wholeHeard(report, question) : heardContains(question)),
    partHeard: kind => {
      const part = c.dataParts.find(p => p.kind === kind);
      return !part || wholeHeard(report, part.text);
    },
    heardContains,
  };
}

// The turn's data_request rows as the candidate got them: an answer they
// didn't hear is logged as 'none', with the composed one kept beside it.
export function heardRequestRows(rows: DetectedDataRequest[], h: HeardOutcome): DetectedDataRequest[] {
  const dropped = new Set(h.droppedReveals);
  return rows.map(r => {
    const heard = r.response === 'release' ? !r.ledgerItemIds.some(id => dropped.has(id))
      : r.response === 'refuse' ? h.partHeard('refusals')
        : r.response === 'defer' ? h.partHeard('defers')
          : true;
    return heard ? r : { ...r, response: 'none' as const, unheardResponse: r.response };
  });
}

// The pressure test when this turn's question was not heard: nothing the
// question did stands (an ask, a re-ask, a code-asked probe or structure ask);
// what the candidate's reply decided does (structure given, satisfied), and so
// does the gate's counter.
export function unheardQuestionPressureTest(prev: PressureTestState, next: PressureTestState): PressureTestState {
  if (prev.state === 'awaiting' && next.state === 'satisfied') return next;
  return { ...prev, gatedTurns: next.gatedTurns, structureGiven: next.structureGiven };
}
