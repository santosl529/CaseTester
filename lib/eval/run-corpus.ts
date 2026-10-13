// Every saved run record under `Case Interview Runs/`, read into one shape so
// an offline check can score any run whatever wrote it (fact guards, 12 Oct).
// Three generations of record:
//   - turn_file (batch 18 on, 9 Oct): <run>.turns.jsonl.gz — what each segment
//     delivered (say / data / tail / scripted), what code released, the model's
//     parsed turn. Code-written data lines are known exactly.
//   - record (before 9 Oct): the run JSON only — what was heard per turn, the
//     reveal timestamps, exhibit analytics. Code's data lines are found by the
//     ledger's own wording (code spoke it verbatim in every generation); the
//     rest of the line is the interviewer's (model or a code template).
// Prefix-seeded runs carry the seeded turns copied from another run; those are
// marked `seeded` so they are not counted twice. Free.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from './turn-file';

export type SegmentKind = 'say' | 'data' | 'question' | 'scripted' | 'text';
export type CorpusSegment = { kind: SegmentKind; author: 'model' | 'code' | 'unknown'; text: string; ids?: string[] };

export type CorpusTurn = {
  t: number;                   // the interviewer turn's transcript index (a blind sheet's tN)
  candidateText: string;       // the message it answers ('' for none)
  phase: string;
  kind: string;                // TurnKind ('model', 'close', …); '' when the record doesn't say
  move: string | null;         // the model's declared move (turn files)
  segments: CorpusSegment[];
  heard: string;
  revealedBefore: string[];    // ledger ids revealed before this turn
  releasedNow: string[];       // ledger ids this turn released (data lines and exhibits)
  shownBefore: string[];       // exhibits shown before this turn
  exhibitNow: string | null;   // an exhibit handed over this turn
  seeded: boolean;             // copied from another run by a prefix seed — not this run's interviewer
  openBefore?: string[];       // ledger ids of explicit asks still open before this turn (turn files only)
};

export type CorpusRun = {
  id: string;                  // "<group>/<wave or folder>/<run dir or file stem>"
  dir: string;
  group: string;               // batch label: "batch-18", "batch-20-sonnet", "default-candidate", "prefix", …
  date: string;                // YYYY-MM-DD
  model: string;               // the interviewer model that answered
  persona: string;             // persona dir name, or "default"
  format: 'turn_file' | 'record';
  status: string;
  turns: CorpusTurn[];
  candidateTurns: { t: number; text: string }[];
  caseId: string;
};

export type CorpusSkip = { path: string; reason: string };

type LedgerLike = { id: string; value: string }[];

type RunJson = {
  session: { caseId: string; status: string; startedAt: string; flagsJsonb?: { moves?: Record<string, string> } };
  turns: { turnIndex: number; role: string; text: string; timestampMs: number }[];
  revealed: { ledgerItemId: string; revealedAtMs: number }[];
  analytics: { eventType: string; createdAt: string; payloadJsonb: Record<string, unknown> }[];
  events?: { category: string; subtype: string; turnIndex: number | null; payloadJsonb: Record<string, unknown> }[];
};

const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

// Splits a heard interviewer line into data lines (the ledger's wording) and
// the rest. Each ledger value found is cut out to its sentence end(s).
export function splitByLedger(heard: string, ledger: LedgerLike): CorpusSegment[] {
  const text = norm(heard);
  const spans: { start: number; end: number; id?: string }[] = [];
  for (const it of ledger) {
    const v = norm(it.value.trim());
    const core = v.slice(0, Math.min(v.length, 28));
    let from = 0;
    for (;;) {
      const i = text.indexOf(core, from);
      if (i < 0) break;
      // The value runs for its own length or to the sentence end where an older, shorter wording stops.
      let end = i;
      const full = text.slice(i, i + v.length);
      if (full === v) end = i + v.length;
      else {
        const m = /[.?!](?:\s|$)/.exec(text.slice(i + core.length));
        end = m ? i + core.length + m.index + 1 : text.length;
      }
      spans.push({ start: i, end, id: it.id });
      from = end;
    }
  }
  // Code's lead-ins for data lines.
  for (const m of text.matchAll(/(?:On what you asked for|Coming back to what you asked for earlier|You asked about this earlier|To correct one figure)\s*:\s*/g)) spans.push({ start: m.index!, end: m.index! + m[0].length });
  spans.sort((a, b) => a.start - b.start);
  const segs: CorpusSegment[] = [];
  let pos = 0;
  for (const s of spans) {
    if (s.start < pos) { pos = Math.max(pos, s.end); continue; }
    const before = text.slice(pos, s.start).trim();
    if (before) segs.push({ kind: 'text', author: 'unknown', text: before });
    segs.push({ kind: 'data', author: 'code', text: text.slice(s.start, s.end).trim(), ids: s.id ? [s.id] : [] });
    pos = s.end;
  }
  const rest = text.slice(pos).trim();
  if (rest) segs.push({ kind: 'text', author: 'unknown', text: rest });
  // Merge adjacent data pieces (a lead-in and its value).
  return segs.reduce<CorpusSegment[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && last.kind === 'data' && s.kind === 'data') { last.text = `${last.text} ${s.text}`; last.ids = [...(last.ids ?? []), ...(s.ids ?? [])]; }
    else acc.push({ ...s });
    return acc;
  }, []);
}

function groupOf(rel: string, header: { batch?: string | null } | null): string {
  const parts = rel.split(path.sep);
  if (parts[0] === 'default-candidate') return header?.batch ? `${header.batch}` : 'default-candidate';
  const wave = parts[1] ?? parts[0];
  const m = /^(batch-\d+(?:-(?:haiku|sonnet|haikulow))?)(?=-)/.exec(wave) ?? /^(batch-\d+)/.exec(wave);
  if (m) return wave.startsWith('batch-18-v3-prefix') ? 'batch-18-prefix' : m[1];
  if (/^(prefix|repro|smoke)-/.test(wave)) return wave.replace(/-\d+$/, '');
  return wave;
}

function modelOf(run: RunJson, header: { models?: Record<string, string> } | null): string {
  if (header?.models?.interviewer) return header.models.interviewer;
  const m = run.analytics.find(a => a.eventType === 'llm_usage' && ['interviewer', 'interviewer_turn', 'agent'].includes(String(a.payloadJsonb.component)));
  return String(m?.payloadJsonb.model ?? 'unknown');
}

function seededThrough(dir: string, stem: string): number {
  const log = path.join(dir, `${stem}.log`);
  if (!existsSync(log)) return -1;
  const head = readFileSync(log, 'utf8').slice(0, 4000);
  const m = /seeded from .* through t(\d+)/.exec(head);
  return m ? Number(m[1]) : -1;
}

function fromTurnFile(p: string, covers: (exhibitId: string) => string[]): { turns: CorpusTurn[]; header: { batch?: string | null; models?: Record<string, string> } } {
  const { header, turns } = readTurnFile(p);
  const out: CorpusTurn[] = turns.map(r => {
    const pq = r.parsedTurn?.question?.trim() ?? '';
    const segments: CorpusSegment[] = r.delivered.map(d => {
      if (d.kind === 'say') return { kind: 'say', author: 'model', text: d.text };
      if (d.kind === 'data') return { kind: 'data', author: 'code', text: d.text };
      if (d.kind === 'scripted') return { kind: 'scripted', author: 'code', text: d.text };
      // tail: the model's question unless code wrote it (a replacement or a code-written turn).
      const model = r.stateBefore.kind === 'model' && pq.length > 0 && (norm(d.text).includes(norm(pq).slice(0, 40)) || norm(pq).includes(norm(d.text).slice(0, 40)));
      return { kind: 'question', author: model ? 'model' : 'code', text: d.text };
    });
    // A data line segment may also hold code's correction or exhibit line: fine — all code.

    const exhibitNow = r.delivered.find(d => d.exhibitId)?.exhibitId ?? null;
    // An exhibit releases the ledger items it shows.
    const releasedNow = [...new Set([...r.delivered.flatMap(d => d.revealIds), ...(exhibitNow ? covers(exhibitNow) : [])])];
    return {
      t: r.turnIndex + 1, candidateText: r.candidateText, phase: r.stateBefore.phase, kind: r.stateBefore.kind,
      move: r.parsedTurn?.move ?? null, segments, heard: r.savedLine,
      revealedBefore: r.stateBefore.revealedIds, releasedNow, shownBefore: r.stateBefore.shownExhibitIds, exhibitNow, seeded: false,
      openBefore: r.stateBefore.openDataRequests.map(o => o.ledgerItemId),
    };
  });
  return { turns: out, header };
}

function fromRecord(run: RunJson, ledger: LedgerLike, covers: (exhibitId: string) => string[]): CorpusTurn[] {
  const exhibits = run.analytics.filter(a => a.eventType === 'exhibit_shown').map(a => ({ at: Date.parse(a.createdAt), id: String(a.payloadJsonb.exhibitId ?? 'exhibit-a') }));
  const latency = new Map(run.analytics.filter(a => a.eventType === 'turn_latency').map(a => [Number(a.payloadJsonb.turnIndex), a.payloadJsonb]));
  const moves = run.session.flagsJsonb?.moves ?? {};
  const out: CorpusTurn[] = [];
  const ts = [...run.turns].sort((a, b) => a.turnIndex - b.turnIndex);
  // What was revealed is read from the record's own lines: the ledger wording
  // each interviewer turn carried, and the exhibits shown (their covered items).
  // The reveal timestamps are not used — before 9 Oct some are stamped at the
  // candidate's message, some at the next turn.
  const revealed = new Set<string>();
  const shown = new Set<string>();
  for (let k = 0; k < ts.length; k++) {
    const t = ts[k];
    if (t.role !== 'interviewer') continue;
    const segments = splitByLedger(t.text, ledger);
    const prev = ts.slice(0, k).reverse().find(x => x.role === 'candidate');
    const prevI = ts.slice(0, k).reverse().find(x => x.role === 'interviewer');
    const since = Math.max(prev?.timestampMs ?? 0, prevI?.timestampMs ?? 0);
    const exhibitNow = exhibits.find(e => e.at > since && e.at <= t.timestampMs + 5000 && !shown.has(e.id))?.id ?? null;
    const releasedNow = [...new Set([...segments.flatMap(s => s.ids ?? []), ...(exhibitNow ? covers(exhibitNow) : [])])];
    // The opening (prompt + invitation) answers no message.
    if (prev) {
      const lat = latency.get(t.turnIndex) as { kind?: string; phase?: string } | undefined;
      out.push({
        t: t.turnIndex, candidateText: prev.text, phase: lat?.phase ?? '', kind: lat?.kind ?? '', move: moves[String(t.turnIndex)] ?? null,
        segments, heard: t.text, revealedBefore: [...revealed], releasedNow, shownBefore: [...shown], exhibitNow, seeded: false,
      });
    }
    for (const id of releasedNow) revealed.add(id);
    if (exhibitNow) shown.add(exhibitNow);
  }
  return out;
}

export type CaseLike = { dataLedger: LedgerLike; exhibits: { id: string; coversLedgerItems?: string[] }[] };

export function loadRun(file: string, root: string, caseFor: (caseId: string) => CaseLike): CorpusRun {
  const dir = path.dirname(file);
  const stem = path.basename(file, '.json');
  const run = JSON.parse(readFileSync(file, 'utf8')) as RunJson;
  const c = caseFor(run.session.caseId);
  const ledger = c.dataLedger;
  const tf = path.join(dir, `${stem}.turns.jsonl.gz`);
  let turns: CorpusTurn[];
  let header: { batch?: string | null; models?: Record<string, string> } | null = null;
  let format: CorpusRun['format'];
  if (existsSync(tf)) {
    const r = fromTurnFile(tf, id => c.exhibits.find(e => e.id === id)?.coversLedgerItems ?? []);
    turns = r.turns; header = r.header; format = 'turn_file';
  } else {
    turns = fromRecord(run, ledger, id => c.exhibits.find(e => e.id === id)?.coversLedgerItems ?? []); format = 'record';
  }
  const seeded = seededThrough(dir, stem);
  for (const t of turns) t.seeded = t.t <= seeded;
  const rel = path.relative(root, file);
  const parts = rel.split(path.sep);
  const persona = parts[0] === 'default-candidate' ? 'default' : (parts.length >= 3 ? parts[parts.length - 2] : 'default');
  return {
    id: rel.replace(/\.json$/, ''), dir, group: groupOf(rel, header), date: (run.session.startedAt ?? '').slice(0, 10),
    model: modelOf(run, header), persona, format, status: run.session.status, turns,
    candidateTurns: run.turns.filter(t => t.role === 'candidate').map(t => ({ t: t.turnIndex, text: t.text })).filter(c => c.t > seeded),
    caseId: run.session.caseId,
  };
}

// Every live-run-*.json under the root.
export function runFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = path.join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/^live-run-.*\.json$/.test(f)) out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

export function loadCorpus(root: string, caseFor: (caseId: string) => CaseLike): { runs: CorpusRun[]; skipped: CorpusSkip[] } {
  const runs: CorpusRun[] = [];
  const skipped: CorpusSkip[] = [];
  for (const f of runFiles(root)) {
    try {
      const r = loadRun(f, root, caseFor);
      if (r.turns.length === 0) { skipped.push({ path: path.relative(root, f), reason: 'no interviewer turn answering a candidate message' }); continue; }
      if (r.turns.every(t => t.seeded)) { skipped.push({ path: path.relative(root, f), reason: 'every turn seeded from another run' }); continue; }
      runs.push(r);
    } catch (e) {
      skipped.push({ path: path.relative(root, f), reason: `unreadable: ${(e as Error).message.slice(0, 120)}` });
    }
  }
  return { runs, skipped };
}
