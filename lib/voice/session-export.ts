// A voice session's review files from the database (scripts/voice-export.ts):
// the per-turn jsonl as the agent used to write it, and a turn-by-turn
// transcript. Pure; the script does the reads and writes.
export type ExportedLine = { line: unknown; createdAt: Date | string };
export type ExportedTurn = { turnIndex: number; role: string; text: string; timestampMs: number };

// The day the agent started (its first line), as the old voice-live/<date>/ folder.
export function sessionDate(lines: ExportedLine[], fallback: Date | string): string {
  return new Date(lines[0]?.createdAt ?? fallback).toISOString().slice(0, 10);
}

export const jsonlOf = (lines: ExportedLine[]) => lines.map(l => JSON.stringify(l.line) + '\n').join('');

// A filler code picked but didn't play (thinking sounds off, the rate, a cut,
// the reply first) still opens the saved interviewer line — the runner was
// told of it before the skip. The agent's records name each skip; it is
// matched to its turn by the candidate message, in order (cancelled records
// have no turn), and marked in the transcript.
type SkippedAck = { ack: string; why: string };
function skippedAcks(turns: ExportedTurn[], lines: ExportedLine[]): Map<number, SkippedAck> {
  const recs = lines.map(l => l.line as { candidateText?: string; cancelled?: boolean; ackSkipped?: SkippedAck | null })
    .filter(r => typeof r?.candidateText === 'string' && !r.cancelled);
  const out = new Map<number, SkippedAck>();
  let i = 0;
  for (const r of recs) {
    while (i < turns.length && !(turns[i].role !== 'interviewer' && turns[i].text === r.candidateText)) i++;
    if (i >= turns.length) break;
    const next = turns[i + 1];
    if (r.ackSkipped && next?.role === 'interviewer' && next.text.startsWith(r.ackSkipped.ack)) out.set(next.turnIndex, r.ackSkipped);
    i++;
  }
  return out;
}

export function transcriptMd(s: { id: string; caseId: string; status: string; startedAt: Date | string }, turns: ExportedTurn[], lines: ExportedLine[] = []): string {
  const sorted = [...turns].sort((a, b) => a.turnIndex - b.turnIndex);
  const t0 = sorted[0]?.timestampMs ?? 0;
  const clock = (ms: number) => { const sec = Math.max(0, Math.round((ms - t0) / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
  const out = [`# Voice session ${s.id}`, '', `- Case \`${s.caseId}\` · status **${s.status}** · started ${new Date(s.startedAt).toISOString()}`, ''];
  const skipped = skippedAcks(sorted, lines);
  for (const t of sorted) {
    const sk = skipped.get(t.turnIndex);
    const text = sk ? `~~${sk.ack}~~ *(filler skipped: ${sk.why})* ${t.text.slice(sk.ack.length).trim()}` : t.text;
    out.push(`**t${t.turnIndex} ${t.role === 'interviewer' ? 'Interviewer' : 'Candidate'}** (${clock(t.timestampMs)}): ${text}`, '');
  }
  return out.join('\n');
}
