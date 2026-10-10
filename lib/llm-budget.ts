// Run budget for paid experiments (8 Oct). Production installs none. A script
// installs one (LLM_BUDGET_USD, optionally LLM_BUDGET_FILE shared by parallel
// runs of one batch); every Anthropic call made through lib/anthropic-client.ts
// is then checked before it is sent and recorded from the API's own usage
// numbers when it returns (lib/llm-meter.ts) — classifiers, judges, the
// interviewer, the candidate simulator and aborted streams alike, whether or
// not the caller reports onUsage.
//
// Enforcement: a call is refused (BudgetExceededError) once recorded spend has
// reached the cap, or if its model has no price. Calls already in flight
// finish, so a run can overshoot by at most the calls running concurrently.
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { assertPriced, costOf } from './llm-pricing';

export class BudgetExceededError extends Error {
  constructor(public readonly spentUsd: number, public readonly capUsd: number) {
    super(`run budget reached: $${spentUsd.toFixed(4)} spent of $${capUsd.toFixed(2)} — call refused`);
    this.name = 'BudgetExceededError';
  }
}

export type MeterEntry = {
  model: string; inputTokens: number; outputTokens: number;
  cacheReadTokens: number; cacheWriteTokens: number;
  outputEstimated: boolean;   // stream aborted before the final usage arrived
};

interface Ledger { add(usd: number, e: MeterEntry): void; spent(): number }

class MemoryLedger implements Ledger {
  private total = 0;
  add(usd: number) { this.total += usd; }
  spent() { return this.total; }
}

// One JSON line per call, appended (atomic for short lines on POSIX), summed
// on read — so parallel processes of one batch share one cap.
class FileLedger implements Ledger {
  constructor(private path: string) {}
  add(usd: number, e: MeterEntry) {
    appendFileSync(this.path, JSON.stringify({ usd, ...e, at: new Date().toISOString(), pid: process.pid }) + '\n');
  }
  spent() {
    if (!existsSync(this.path)) return 0;
    return readFileSync(this.path, 'utf8').split('\n').filter(Boolean)
      .reduce((s, l) => s + (JSON.parse(l) as { usd: number }).usd, 0);
  }
}

// An extra cap beside the main one (LLM_EXTRA_BUDGET_USD + _FILE): a targeted
// check inside a batch keeps its own limit while the batch cap still applies.
// Every call is checked against both and recorded in both.
type ExtraCap = { capUsd: number; ledger: Ledger };

export class RunBudget {
  readonly byModel = new Map<string, { calls: number; usd: number; estimated: number }>();
  constructor(readonly capUsd: number, private ledger: Ledger = new MemoryLedger(), private extra: ExtraCap | null = null) {
    if (!(capUsd > 0)) throw new Error(`run budget must be a positive dollar amount (got ${capUsd})`);
    if (extra && !(extra.capUsd > 0)) throw new Error(`extra budget must be a positive dollar amount (got ${extra.capUsd})`);
  }
  get spentUsd() { return this.ledger.spent(); }
  get extraSpentUsd() { return this.extra?.ledger.spent() ?? 0; }
  get exceeded() { return this.spentUsd >= this.capUsd || (this.extra !== null && this.extraSpentUsd >= this.extra.capUsd); }

  // Before a call: refuse an unpriced model or a spent budget (either cap).
  check(model: string): void {
    assertPriced(model);
    const spent = this.spentUsd;
    if (spent >= this.capUsd) throw new BudgetExceededError(spent, this.capUsd);
    if (this.extra) {
      const extraSpent = this.extraSpentUsd;
      if (extraSpent >= this.extra.capUsd) throw new BudgetExceededError(extraSpent, this.extra.capUsd);
    }
  }

  record(e: MeterEntry): number {
    const usd = costOf(e);
    this.ledger.add(usd, e);
    this.extra?.ledger.add(usd, e);
    const m = this.byModel.get(e.model) ?? { calls: 0, usd: 0, estimated: 0 };
    m.calls += 1; m.usd += usd; if (e.outputEstimated) m.estimated += 1;
    this.byModel.set(e.model, m);
    return usd;
  }

  summary(): string {
    const rows = [...this.byModel].map(([model, m]) => `${model} ${m.calls} calls $${m.usd.toFixed(4)}${m.estimated ? ` (${m.estimated} with estimated output)` : ''}`);
    const extra = this.extra ? ` · extra cap: spent $${this.extraSpentUsd.toFixed(4)} of $${this.extra.capUsd.toFixed(2)}` : '';
    return `spent $${this.spentUsd.toFixed(4)} of $${this.capUsd.toFixed(2)}${extra}${rows.length ? ` — this process: ${rows.join('; ')}` : ''}`;
  }
}

let active: RunBudget | null = null;

export function installRunBudget(capUsd: number, ledgerFile?: string, extra?: { capUsd: number; ledgerFile: string }): RunBudget {
  active = new RunBudget(capUsd, ledgerFile ? new FileLedger(ledgerFile) : new MemoryLedger(),
    extra ? { capUsd: extra.capUsd, ledger: new FileLedger(extra.ledgerFile) } : null);
  return active;
}
export function activeRunBudget(): RunBudget | null { return active; }
export function clearRunBudget(): void { active = null; }

// For paid scripts: a budget is required. LLM_BUDGET_USD sets the cap;
// LLM_BUDGET_FILE (optional) shares it across a batch's parallel processes.
export function requireRunBudget(script: string): RunBudget {
  const cap = Number(process.env.LLM_BUDGET_USD);
  if (!(cap > 0)) {
    throw new Error(`${script} spends real money: set LLM_BUDGET_USD (and LLM_BUDGET_FILE to share one cap across parallel runs)`);
  }
  // Optional extra cap (LLM_EXTRA_BUDGET_USD), always file-shared so it holds
  // across every process of the check.
  const extraCap = process.env.LLM_EXTRA_BUDGET_USD ? Number(process.env.LLM_EXTRA_BUDGET_USD) : null;
  if (extraCap !== null && !process.env.LLM_EXTRA_BUDGET_FILE) throw new Error(`${script}: LLM_EXTRA_BUDGET_USD needs LLM_EXTRA_BUDGET_FILE (the extra cap is shared across processes)`);
  const b = installRunBudget(cap, process.env.LLM_BUDGET_FILE || undefined,
    extraCap !== null ? { capUsd: extraCap, ledgerFile: process.env.LLM_EXTRA_BUDGET_FILE! } : undefined);
  console.log(`[budget] ${script}: cap $${cap.toFixed(2)}${process.env.LLM_BUDGET_FILE ? ` shared via ${process.env.LLM_BUDGET_FILE}` : ''} · already spent $${b.spentUsd.toFixed(4)}`
    + (extraCap !== null ? ` · extra cap $${extraCap.toFixed(2)} via ${process.env.LLM_EXTRA_BUDGET_FILE} · already spent $${b.extraSpentUsd.toFixed(4)}` : ''));
  if (b.spentUsd >= cap) throw new BudgetExceededError(b.spentUsd, cap);
  if (extraCap !== null && b.extraSpentUsd >= extraCap) throw new BudgetExceededError(b.extraSpentUsd, extraCap);
  return b;
}
