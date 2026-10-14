// The simulated candidate's reply (scripts/live-run.ts). Lorenzo, 13 Oct
// (Larkspur rulings, d; Destiny, persona 6): a call that came back with no
// text block and no refusal lost the run with no record of why. A reply with
// no text — or a refusal — is an error that names the stop reason, the block
// types and the model that answered, so the log says what happened.
export type SimulatorStop = { stopReason: string | null; blockTypes: string[]; model: string };

export class SimulatorReplyError extends Error {
  constructor(message: string, readonly stop: SimulatorStop) {
    super(message);
    this.name = 'SimulatorReplyError';
  }
}

export const describeStop = (s: SimulatorStop) =>
  `stop reason ${s.stopReason ?? 'none'}, blocks [${s.blockTypes.join(', ') || 'none'}], model ${s.model}`;

export function simulatorReplyText(r: { stop_reason: string | null; content: { type: string; text?: string }[]; model: string }): string {
  const stop: SimulatorStop = { stopReason: r.stop_reason, blockTypes: r.content.map(b => b.type), model: r.model };
  if (r.stop_reason === 'refusal') throw new SimulatorReplyError(`candidate simulator refused — ${describeStop(stop)}`, stop);
  const text = r.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n').trim();
  if (!text) throw new SimulatorReplyError(`candidate simulator returned no text — ${describeStop(stop)}`, stop);
  return text;
}
