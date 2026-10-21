import fs from 'fs';
import path from 'path';
import { CaseSchema, type Case } from './schema';
import { DataLineVariantsSchema, checkDataLineVariants } from './data-line-variants';
import { Phase1OverlaySchema, applyPhase1Overlay } from './phase1-overlay';

let _cache: Case[] | null = null;

export function loadCases(): Case[] {
  if (_cache) return _cache;

  const casesDir = path.join(process.cwd(), 'cases');
  const files = fs.readdirSync(casesDir).filter(f => f.endsWith('.json'));

  _cache = files.map(file => {
    const raw = JSON.parse(fs.readFileSync(path.join(casesDir, file), 'utf-8'));
    const result = CaseSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(`Malformed case file ${file}: ${result.error.message}`);
    }
    return withPhase1Overlay(casesDir, result.data);
  });
  _dataLines = loadDataLineVariants(casesDir, _cache);

  return _cache;
}

// Phase 1 case data (cases/phase1/<caseId>.json; lib/cases/phase1-overlay.ts): checked on load, merged per switch.
function withPhase1Overlay(casesDir: string, c: Case): Case {
  const file = path.join(casesDir, 'phase1', `${c.id}.json`);
  if (!fs.existsSync(file)) return c;
  const result = Phase1OverlaySchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf-8')));
  if (!result.success) throw new Error(`Malformed Phase 1 overlay phase1/${c.id}.json: ${result.error.message}`);
  return applyPhase1Overlay(c, result.data);
}

// Pre-written data-line versions (cases/variants/<caseId>.data-lines.json; brief
// B, 18 Oct), keyed by the ledger line they vary. Checked here like the cases.
let _dataLines: Map<string, { itemId: string; versions: readonly string[] }> = new Map();
function loadDataLineVariants(casesDir: string, cases: Case[]): typeof _dataLines {
  const dir = path.join(casesDir, 'variants');
  const out: typeof _dataLines = new Map();
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.data-lines.json'))) {
    const result = DataLineVariantsSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')));
    if (!result.success) throw new Error(`Malformed data-line variants ${file}: ${result.error.message}`);
    const c = cases.find(x => x.id === result.data.caseId);
    if (!c) throw new Error(`Data-line variants ${file}: no case ${result.data.caseId}`);
    const problems = checkDataLineVariants(result.data, c.dataLedger);
    if (problems.length > 0) throw new Error(`Data-line variants ${file} don't match the ledger:\n${problems.join('\n')}`);
    for (const [itemId, { versions }] of Object.entries(result.data.items)) out.set(versions[0], { itemId, versions });
  }
  return out;
}

// The versions of a ledger line, or null when it has none.
export function dataLineVersions(value: string): { itemId: string; versions: readonly string[] } | null {
  loadCases();
  return _dataLines.get(value) ?? null;
}

// Every case's data-line versions as phrase pools ("data:<itemId>"), for the use memory.
export function dataLinePools(): Record<string, readonly string[]> {
  loadCases();
  return Object.fromEntries([..._dataLines.values()].map(d => [`data:${d.itemId}`, d.versions]));
}

export function getCaseById(id: string): Case {
  const c = loadCases().find(c => c.id === id);
  if (!c) throw new Error(`Case not found: ${id}`);
  return c;
}
