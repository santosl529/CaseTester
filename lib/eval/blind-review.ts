// Blind review sheets for a head to head (batch 20, 12 Oct): one sheet per
// run under a shuffled code, showing what a grader needs — the persona, each
// candidate message, what the candidate heard split by who wrote it (say /
// data / question / scripted) and which code checks acted — and nothing that
// names or betrays the interviewer model: no model ids, run headers, folder
// names, timing, tokens or cost, and not the sentences code withheld (they
// show the model's habits). The key (code → arm, persona, run) is returned
// apart, to be written to its own file and opened only after grading. A sheet
// that would still name a model is refused, not silently scrubbed.
import { createHash } from 'node:crypto';
import type { TurnRecord } from '@/lib/orchestrator/turn-record';

export type BlindRun = { arm: string; persona: string; source: string; opening: string; turns: TurnRecord[] };
export type BlindReview = {
  sheets: { code: string; markdown: string }[];
  key: Record<string, { arm: string; persona: string; source: string }>;
  gradingCsv: string;
};

const MODEL_WORDS = /\b(?:claude|haiku|sonnet|opus|anthropic|gpt|cerebras)\b/i;
export const FAULT_CODES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'] as const;
export const SERIOUS = ['fr4_number', 'misquote_into_rec', 'stage_missing', 'loop', 'false_close', 'contradicts_data'] as const;

// A deterministic shuffle: order by a hash of seed + source.
function shuffled<T extends { source: string }>(xs: T[], seed: string): T[] {
  const h = (s: string) => createHash('sha256').update(`${seed}:${s}`).digest('hex');
  return [...xs].sort((a, b) => h(a.source).localeCompare(h(b.source)));
}

const LABEL: Record<string, string> = { say: 'say', data: 'data', tail: 'question', scripted: 'scripted' };
const csv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function sheet(code: string, r: BlindRun): string {
  const out = [`# ${code} — ${r.persona}`, '', `**Opening:** ${r.opening.replace(/\n+/g, ' ⏎ ')}`, ''];
  for (const t of r.turns) {
    out.push(`## t${t.turnIndex + 1} · ${t.stateBefore.phase} · ${Math.round((t.stateBefore.elapsedMs ?? 0) / 60000)} min`);
    out.push(`**Candidate:** ${t.candidateText.replace(/\n+/g, ' ⏎ ')}`);
    if (t.delivered.length === 0) out.push(`**Heard:** ${t.savedLine || '(nothing)'}`);
    for (const d of t.delivered) out.push(`- [${LABEL[d.kind] ?? d.kind}] ${d.text}`);
    const acted = t.checks.filter(c => c.decision === 'act').map(c => c.check);
    if (acted.length > 0) out.push(`- _code: ${[...new Set(acted)].join(', ')}_`);
    out.push('');
  }
  const md = out.join('\n');
  const leak = MODEL_WORDS.exec(md);
  if (leak) throw new Error(`sheet ${code} (${r.source}) names a model ("${leak[0]}") — check it by hand before grading`);
  return md;
}

export function buildBlindReview(runs: BlindRun[], seed: string): BlindReview {
  const order = shuffled(runs, seed);
  const sheets: BlindReview['sheets'] = [];
  const key: BlindReview['key'] = {};
  const rows = [['code', 'persona', 'interviewer_turns', ...FAULT_CODES, ...SERIOUS.map(s => `serious_${s}`), 'notes'].join(',')];
  order.forEach((r, i) => {
    const code = `R${String(i + 1).padStart(2, '0')}`;
    sheets.push({ code, markdown: sheet(code, r) });
    key[code] = { arm: r.arm, persona: r.persona, source: r.source };
    rows.push([code, csv(r.persona), String(r.turns.filter(t => t.delivered.length > 0 || t.savedLine).length), ...FAULT_CODES.map(() => ''), ...SERIOUS.map(() => ''), ''].join(','));
  });
  return { sheets, key, gradingCsv: rows.join('\n') + '\n' };
}
