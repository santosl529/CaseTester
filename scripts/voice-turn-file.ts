// A voice session's run, rebuilt for the replay (tester fixes, 29 Oct). The voice agent saves no turn file, so the run
// JSON and turn file the runner replay reads are rebuilt from the session's export (scripts/voice-export.ts): the DB
// dump's turns, check events and data-request events, and the voice log's playback per segment. Free.
//
//   npx tsx scripts/voice-turn-file.ts <export-dir> <sessionId> <wave> <persona-dir>
//     → $REPLAY_ROOT_VOICE (lib/eval/fault-bank-build.ts VOICE_RUNS)/test runs/<wave>/<persona-dir>/live-run-<date>-<id8>.{json,turns.jsonl.gz}
//
// What a rebuilt turn holds: the candidate's message, the turn kind, phase and clock, every check the turn logged,
// and the model's turn as far as it can be read back — "say" and the question as delivered, plus the sentences the
// checks withheld (a question code replaced is the withheld one), the declared requests from the data-request rows,
// the exhibit from the data decisions. The model's raw output is not saved for voice, so a turn whose words code
// changed beyond a withheld sentence replays from what was said. Replay it with REPLAY_VOICE=1.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { VOICE_RUNS } from '@/lib/eval/fault-bank-build';

type Row = Record<string, unknown>;
type Event = { category: string; subtype: string; turnIndex: number; phase?: string; payloadJsonb: Row };
type Turn = { turnIndex: number; role: string; text: string; timestampMs: number };

const [dir, sessionId, wave, persona] = process.argv.slice(2);
if (!persona) throw new Error('usage: voice-turn-file.ts <export-dir> <sessionId> <wave> <persona-dir>');
const dump = JSON.parse(readFileSync(path.join(dir, `${sessionId}-db-dump.json`), 'utf8')) as { session: Row & { flagsJsonb?: { moves?: Record<string, string> } }; turns: Turn[]; events: Event[]; revealed: Row[] };
const turns = [...dump.turns].sort((a, b) => a.turnIndex - b.turnIndex);
const start = turns[0].timestampMs;
const checksAt = new Map<number, Event[]>();
for (const e of dump.events) if (e.category === 'check') checksAt.set(e.turnIndex, [...(checksAt.get(e.turnIndex) ?? []), e]);
const detail = (n: number, name: string) => (checksAt.get(n)?.find(e => e.subtype === name)?.payloadJsonb?.detail ?? {}) as Row;
const moves = dump.session.flagsJsonb?.moves ?? {};
// The voice acknowledgments code speaks before the turn (voice/acknowledge.ts): one leads a turn's saved line.
const ACKS = ['Hmm… alright…', 'Alright…', 'Mhm…', 'Hmm…', 'Mhm… okay…', 'Hmm… okay…', 'Sure, take a moment.', 'Take your time.', 'Okay…'].sort((a, b) => b.length - a.length);
const sentences = (t: string) => t.split(/(?<=[.?!])\s+/).filter(x => x.trim());

const records: Row[] = [];
// What was out before each turn: the data decisions' releases and exhibits of the turns before it.
const revealedSoFar: string[] = [];
const shownSoFar: string[] = [];
for (const t of turns) {
  if (t.role !== 'candidate') continue;
  const n = t.turnIndex;
  const iv = turns.find(x => x.turnIndex === n + 1);
  if (!iv) continue;
  const ack = ACKS.find(a => iv.text.startsWith(`${a} `));
  const rest = ack ? iv.text.slice(ack.length).trim() : iv.text;
  // Whole sentences to each played segment, by its heard length.
  const play = ((detail(n, 'voice_heard').playback ?? []) as { kind: string; heardChars?: number }[]);
  const ss = sentences(rest);
  const segs: { kind: string; text: string }[] = [];
  let i = 0;
  play.forEach((p, j) => {
    const take: string[] = [];
    if (j === play.length - 1) take.push(...ss.slice(i));
    else for (let c = 0; i + take.length < ss.length && c < (p.heardChars ?? 0) * 0.85;) { const s = ss[i + take.length]; take.push(s); c += s.length + 1; }
    i += take.length;
    if (take.length) segs.push({ kind: p.kind, text: take.join(' ') });
  });
  if (i < ss.length) segs.push({ kind: 'tail', text: ss.slice(i).join(' ') });
  if (segs.length === 0) segs.push({ kind: 'tail', text: rest });
  const withheld = (detail(n, 'vetoes').withheld ?? []) as { field: string; sentence: string }[];
  const replaced = Boolean(detail(n, 'math_challenge').replacement);
  const say = [...withheld.filter(w => w.field === 'say').map(w => w.sentence), ...segs.filter(s => s.kind === 'say').map(s => s.text)].join(' ');
  const tail = segs.filter(s => s.kind === 'tail').map(s => s.text).join(' ');
  const wq = withheld.filter(w => w.field === 'question').map(w => w.sentence);
  const question = wq.length ? (replaced ? wq : [...wq, tail]).join(' ') : tail;
  const requests = dump.events.filter(e => e.category === 'data_request' && ['release', 'defer', 'refuse'].includes(e.subtype) && e.payloadJsonb.interviewerTurnIndex === n + 1)
    .map(e => ({ what: e.payloadJsonb.what, itemIds: e.payloadJsonb.ledgerItemIds ?? [], explicit: Boolean(e.payloadJsonb.explicit), respond: e.subtype === 'defer' ? 'defer' : 'release' }));
  const pt = detail(n, 'pressure_test');
  records.push({
    type: 'turn', sessionId, turnIndex: n, candidateText: t.text,
    stateBefore: { phase: checksAt.get(n)?.find(e => e.phase)?.phase ?? 'ANALYSIS', elapsedMs: t.timestampMs - start, kind: detail(n, 'turn_kind').kind ?? 'model',
      pressureTest: { state: pt.from ?? 'not_asked', structureGiven: true }, openDataRequests: [], promptContext: null,
      revealedIds: [...revealedSoFar], shownExhibitIds: [...shownSoFar] },
    requests: [], outputs: [],
    parsedTurn: { move: moves[String(n + 1)] ?? 'other', requests, exhibit: detail(n, 'data_decisions').exhibit ?? null, rescueItem: null, say, question },
    validation: null, checks: (checksAt.get(n) ?? []).map(e => ({ check: e.subtype, decision: e.payloadJsonb.decision, reason: e.payloadJsonb.reason, detail: e.payloadJsonb.detail })),
    delivered: segs.map(s => ({ ...s, revealIds: [], atMs: 0 })), savedLine: iv.text, phaseAfter: null, ended: false, timing: {}, usage: {}, recorderErrors: [],
  });
  const dd = detail(n, 'data_decisions') as { releases?: string[]; exhibit?: string | null };
  revealedSoFar.push(...(dd.releases ?? []));
  if (dd.exhibit) shownSoFar.push(dd.exhibit);
}
const out = path.join(VOICE_RUNS, 'test runs', wave, persona);
mkdirSync(out, { recursive: true });
const stem = path.join(out, `live-run-${String(dump.session.startedAt).slice(0, 10)}-${sessionId.slice(0, 8)}`);
const header = { type: 'header', batch: 'voice-live', version: 'v1', wave, runNumber: 1, rerun: 0, commit: 'voice', dirty: false, models: { interviewer: 'claude-sonnet-5-5' },
  interviewerConfig: 'sonnet55-baseline', persona: { id: 1, name: `${persona} (voice, rebuilt)`, brief: '' }, sessionId, startedAt: dump.session.startedAt, engineSwitches: [],
  rebuilt: 'scripts/voice-turn-file.ts: from the DB dump and the voice log — no recorded model outputs' };
const end = { type: 'end', ended: true, budgetStopped: false, scoring: 'none' };
writeFileSync(`${stem}.turns.jsonl.gz`, gzipSync([header, ...records, end].map(r => JSON.stringify(r)).join('\n') + '\n'));
writeFileSync(`${stem}.json`, JSON.stringify({ session: { id: dump.session.id, caseId: dump.session.caseId, startedAt: dump.session.startedAt, status: dump.session.status, coverageJsonb: null },
  turns, events: dump.events, revealed: dump.revealed, analytics: [{ eventType: 'llm_usage', createdAt: dump.session.startedAt, payloadJsonb: { component: 'interviewer', model: 'claude-sonnet-5-5' } }] }));
console.log(`${records.length} turns → ${stem}.{json,turns.jsonl.gz}`);
