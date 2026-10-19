// The voice silence check-in in the model's history (Lorenzo, 18 Oct, ruling
// 2): something the interviewer said — the model sees it, so it doesn't say
// "take your time" again next turn — but no turn: no session_turns row (the
// rec-ask, the checker and the opener replay read the last interviewer row as
// the question on the table), no stage, clock or turn-count effect. The voice
// agent logs it as a session event; the history adds its heard text to the
// interviewer message before it.

export const VOICE_CHECK_IN = { category: 'intervention', subtype: 'voice_check_in' } as const;
export type CheckInLine = { text: string; atMs: number };

export function checkInLinesOf(rows: { category: string; subtype: string; payloadJsonb: unknown }[]): CheckInLine[] {
  return rows
    .filter(r => r.category === VOICE_CHECK_IN.category && r.subtype === VOICE_CHECK_IN.subtype)
    .map(r => r.payloadJsonb as Partial<CheckInLine> | null)
    .filter((p): p is CheckInLine => typeof p?.text === 'string' && p.text.trim() !== '' && typeof p.atMs === 'number')
    .sort((a, b) => a.atMs - b.atMs);
}

type Msg = { role: 'user' | 'assistant'; content: string };

// Each check-in onto the message of the last row said before it: an
// interviewer message takes it on (the alternation stays); after a candidate
// row (none so far) it is an interviewer message of its own.
export function historyWithCheckIns(rows: { role: string; text: string; timestampMs: number }[], checkIns: CheckInLine[]): Msg[] {
  const out: (Msg & { atMs: number })[] = rows.map(t => ({ role: t.role === 'candidate' ? 'user' : 'assistant', content: t.text, atMs: t.timestampMs }));
  for (const c of checkIns) {
    let i = -1;
    for (let k = 0; k < out.length; k++) if (out[k].atMs <= c.atMs) i = k;
    if (i >= 0 && out[i].role === 'assistant') out[i] = { ...out[i], content: `${out[i].content} ${c.text}`.trim() };
    else out.splice(i + 1, 0, { role: 'assistant', content: c.text, atMs: c.atMs });
  }
  return out.map(({ role, content }) => ({ role, content }));
}
