// Saved interviewer turns, for replaying a new check over finished runs
// (12 Oct). A run with a turn file (<run>.turns.jsonl.gz, batch 18 on) is read
// from it: what each segment delivered and what code decided. Older runs
// (batches 12–17) are read from the run log (the model's raw reply per runner
// turn) and the run record (what was heard, the check events). Free.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { readTurnFile } from './turn-file';

export type SavedTurn = {
  run: string;                 // "<wave dir>/<run dir>"
  turn: number;                // the interviewer turn's index
  kind: string;                // TurnKind ('model' for a model turn)
  phase: string;
  elapsedMs: number | null;
  candidateText: string;
  modelSay: string | null;     // the model's own words (null on a code-written turn)
  modelQuestion: string | null;
  deliveredSay: string | null; // what the candidate heard of "say" (turn files only)
  question: string | null;     // what went out after the data line (turn files: the tail; else the model's question when heard)
  heard: string;
  releases: string[];
  exhibit: string | null;
  defers: string[];
  offers: string[];
  refusals: string[];
  source: 'turn_file' | 'log';
};

type CheckDetail = { releases?: string[]; exhibit?: string | null; defers?: string[]; gateDefers?: string[]; offers?: string[]; refusals?: string[] };

function decisionsOf(detail: CheckDetail | undefined) {
  return {
    releases: detail?.releases ?? [], exhibit: detail?.exhibit ?? null,
    defers: [...(detail?.defers ?? []), ...(detail?.gateDefers ?? [])], offers: detail?.offers ?? [], refusals: detail?.refusals ?? [],
  };
}

function label(dir: string): string {
  return `${path.basename(path.dirname(dir))}/${path.basename(dir)}`;
}

export function loadSavedTurns(dir: string): SavedTurn[] {
  const files = readdirSync(dir);
  const turnFile = files.find(f => f.endsWith('.turns.jsonl.gz'));
  if (turnFile) {
    const { turns } = readTurnFile(path.join(dir, turnFile));
    return turns.map(t => {
      const dd = decisionsOf(t.checks.find(c => c.check === 'data_decisions')?.detail as CheckDetail | undefined);
      const model = t.stateBefore.kind === 'model';
      const say = t.delivered.filter(d => d.kind === 'say').map(d => d.text).join(' ');
      const tail = t.delivered.filter(d => d.kind === 'tail').map(d => d.text).join(' ');
      return {
        run: label(dir), turn: t.turnIndex + 1, kind: t.stateBefore.kind, phase: t.stateBefore.phase, elapsedMs: t.stateBefore.elapsedMs,
        candidateText: t.candidateText,
        modelSay: model ? t.parsedTurn?.say ?? null : null, modelQuestion: model ? t.parsedTurn?.question ?? null : null,
        deliveredSay: say || null, question: tail || null, heard: t.savedLine, ...dd, source: 'turn_file' as const,
      };
    });
  }
  const json = files.find(f => f.endsWith('.json'));
  const logFile = files.find(f => f.endsWith('.log'));
  if (!json || !logFile) return [];
  const run = JSON.parse(readFileSync(path.join(dir, json), 'utf8')) as {
    turns: { turnIndex: number; role: string; text: string }[];
    events: { category: string; subtype: string; turnIndex: number | null; payloadJsonb: { detail?: CheckDetail } }[];
    analytics: { eventType: string; createdAt: string; payloadJsonb: { turnIndex: number; kind?: string; phase?: string } }[];
  };
  const log = readFileSync(path.join(dir, logFile), 'utf8');
  // One log group per runner turn, in the order of the turn_latency events.
  const groups = log.split(/^\[runner\] phase:/m).slice(1).map(g => [...g.matchAll(/^\[interviewer-model\] raw response: (.*)$/gm)].map(m => m[1]));
  const latency = run.analytics.filter(a => a.eventType === 'turn_latency').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(a => a.payloadJsonb);
  if (groups.length !== latency.length) return [];
  return latency.map((lat, k) => {
    const raws = groups[k];
    let parsed: { say?: string; question?: string } | null = null;
    try { parsed = raws.length ? JSON.parse(raws[raws.length - 1]) : null; } catch { parsed = null; }
    const kind = lat.kind ?? (raws.length ? 'model' : 'scripted');
    const heard = run.turns.find(t => t.turnIndex === lat.turnIndex && t.role === 'interviewer')?.text ?? '';
    const dd = decisionsOf(run.events.find(e => e.category === 'check' && e.subtype === 'data_decisions' && e.turnIndex === lat.turnIndex - 1)?.payloadJsonb.detail);
    const q = kind === 'model' ? parsed?.question ?? null : null;
    return {
      run: label(dir), turn: lat.turnIndex, kind, phase: lat.phase ?? '', elapsedMs: null,
      candidateText: run.turns.find(t => t.turnIndex === lat.turnIndex - 1 && t.role === 'candidate')?.text ?? '',
      modelSay: kind === 'model' ? parsed?.say ?? null : null, modelQuestion: q,
      deliveredSay: null, question: q && heard.includes(q.trim()) ? q.trim() : null, heard, ...dd, source: 'log' as const,
    };
  });
}

// Run directories under the test-runs root whose wave folder starts with one
// of the prefixes ("batch-12", …), each holding one run record.
export function savedRunDirs(root: string, prefixes: string[]): string[] {
  const out: string[] = [];
  for (const wave of readdirSync(root).filter(w => prefixes.some(p => w.startsWith(p))).sort()) {
    const wdir = path.join(root, wave);
    if (!statSync(wdir).isDirectory()) continue;
    for (const r of readdirSync(wdir).sort()) {
      const rdir = path.join(wdir, r);
      if (statSync(rdir).isDirectory() && existsSync(rdir) && readdirSync(rdir).some(f => f.endsWith('.log'))) out.push(rdir);
    }
  }
  return out;
}
