import { PHASES, type Phase } from './state-machine';

export type LedgerItem = {
  id: string;
  label: string;
  value: string;
  releaseWhen: Phase;
};

export type DataLedger = {
  items: LedgerItem[];
  revealed: Set<string>;
};

export function createLedger(items: LedgerItem[]): DataLedger {
  return { items, revealed: new Set() };
}

export function canReveal(ledger: DataLedger, itemId: string, currentPhase: Phase): boolean {
  if (ledger.revealed.has(itemId)) return false;
  const item = ledger.items.find(i => i.id === itemId);
  if (!item) return false;
  return PHASES.indexOf(currentPhase) >= PHASES.indexOf(item.releaseWhen);
}

export function reveal(ledger: DataLedger, itemId: string): string {
  const item = ledger.items.find(i => i.id === itemId);
  if (!item) throw new Error(`Unknown ledger item: ${itemId}`);
  ledger.revealed.add(itemId);
  return item.value;
}

export function revealedValues(ledger: DataLedger): Record<string, string> {
  return Object.fromEntries(
    [...ledger.revealed].map(id => {
      const item = ledger.items.find(i => i.id === id)!;
      return [id, item.value];
    })
  );
}

export function unrevealedLabels(ledger: DataLedger): string[] {
  return ledger.items.filter(i => !ledger.revealed.has(i.id)).map(i => i.label);
}
