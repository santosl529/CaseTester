// Transcript-artifact detection (docs/scoring-qa.md §1). Runs BEFORE any
// scoring pass — order is load-bearing: the evidence audit and omission-claim
// verifier both judge against the transcript, so a contaminated transcript
// (run 3's duplicated opening turn, run 2's blank final turn) gives them
// false confidence. Artifacts are pipeline defects, never the candidate's
// problem: repaired turns are removed before the judge/audits see them, and
// every artifact is logged by the caller as a scoring-QA metric.
//
// Deterministic and conservative by construction — only artifacts with an
// unambiguous signature are repaired:
//   - empty turn: whitespace-only text (removed);
//   - duplicate turn: same role AND identical normalized text as the
//     immediately preceding kept turn (removed — exact-consecutive only, so a
//     candidate legitimately repeating themselves later in the case survives);
//   - truncated close: final interviewer turn ends mid-sentence (logged only —
//     there is no safe deterministic repair for missing words).

//   - fabricated turn: an interviewer turn containing a line that opens as
//     another speaker ("\nuser …", "\nCandidate: …") — the model wrote the
//     candidate's side itself (live run 58cb8061). The continuation is cut
//     (the turn is dropped if nothing precedes it), so the judge can never
//     score interviewer-written text as candidate evidence. Candidate turns
//     are never touched.

import { stripFabricatedTurn } from '@/lib/orchestrator/audit';

export type TranscriptTurn = { role: string; text: string; turnIndex: number };

export type TranscriptArtifact = {
  type: 'empty_turn' | 'duplicate_turn' | 'truncated_close' | 'fabricated_turn';
  turnIndex: number;
};

export type RepairResult = {
  turns: TranscriptTurn[];
  artifacts: TranscriptArtifact[];
};

function norm(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function repairTranscript(turns: TranscriptTurn[]): RepairResult {
  const artifacts: TranscriptArtifact[] = [];
  const kept: TranscriptTurn[] = [];

  for (const original of turns) {
    let turn = original;
    if (turn.role === 'interviewer') {
      const { cleaned, fabricated } = stripFabricatedTurn(turn.text);
      if (fabricated !== null) {
        artifacts.push({ type: 'fabricated_turn', turnIndex: turn.turnIndex });
        if (cleaned === '') continue;
        turn = { ...turn, text: cleaned };
      }
    }
    if (norm(turn.text) === '') {
      artifacts.push({ type: 'empty_turn', turnIndex: turn.turnIndex });
      continue;
    }
    const prev = kept[kept.length - 1];
    if (prev && prev.role === turn.role && norm(prev.text) === norm(turn.text)) {
      artifacts.push({ type: 'duplicate_turn', turnIndex: turn.turnIndex });
      continue;
    }
    kept.push(turn);
  }

  // Truncated close: log-only. A final interviewer turn that ends mid-sentence
  // (no terminal punctuation) signals a cut-off pipeline write, but inventing
  // the missing words would be worse than flagging — the judge is more robust
  // to a short close than the metric is to silence.
  const last = kept[kept.length - 1];
  if (last && last.role === 'interviewer' && !/[.!?"'”’)\]]\s*$/.test(last.text.trim())) {
    artifacts.push({ type: 'truncated_close', turnIndex: last.turnIndex });
  }

  return { turns: kept, artifacts };
}
