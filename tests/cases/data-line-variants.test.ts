// prof-001's data lines in five pre-written versions (Lorenzo's brief B, 18 Oct),
// behind DATA_LINE_VARIANTS=1, default off.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DataLineVariantsSchema, checkDataLineVariants, lineFacts } from '@/lib/cases/data-line-variants';
import { getCaseById, dataLineVersions, dataLinePools } from '@/lib/cases/loader';
import { factBaseFor, findFalseFacts, nameHits } from '@/lib/orchestrator/fact-check';
import { renderDataLines } from '@/lib/orchestrator/data-decisions';
import { PHRASE_MEMORY, recordPhraseUses, type PhraseUses } from '@/lib/orchestrator/phrasing';

const prof = getCaseById('prof-001');
const file = DataLineVariantsSchema.parse(JSON.parse(readFileSync('cases/variants/prof-001.data-lines.json', 'utf8')));
const fb = factBaseFor(prof as never);
const ITEMS = Object.entries(file.items);

describe('the file', () => {
  it('covers every prof-001 ledger item with five versions, the first the ledger line, and passes the load check', () => {
    expect(new Set(Object.keys(file.items))).toEqual(new Set(prof.dataLedger.map(i => i.id)));
    expect(checkDataLineVariants(file, prof.dataLedger)).toEqual([]);
  });
  it('the check refuses a changed figure, a lost period, a new direction, a dropped phrase, a first line not the ledger', () => {
    const bad = (id: string, i: number, text: string) => {
      const copy = structuredClone(file);
      copy.items[id].versions[i] = text;
      return checkDataLineVariants(copy, prof.dataLedger);
    };
    expect(bad('cogs_pct', 2, 'COGS has risen from 42% of revenue two years ago to 59% today.').join()).toMatch(/cogs_pct v3: figures/);
    expect(bad('cogs_pct', 2, 'COGS has risen from 42% of revenue to 58%.').join()).toMatch(/cogs_pct v3: periods/);
    expect(bad('labor_pct', 1, 'Labor has risen to 22% of revenue.').join()).toMatch(/labor_pct v2: directions/);
    expect(bad('avg_ticket', 4, 'The average transaction rose about 10%, from $6.20 two years ago to $6.80.').join()).toMatch(/drops "more items per visit"/);
    expect(bad('revenue_total', 0, 'Revenue totals $480M a year.').join()).toMatch(/first version must be the ledger line/);
  });
  it('reads money, shares, counts and periods', () => {
    expect(lineFacts('The average transaction is $6.80, up from $6.20 two years ago — about a 10% increase.'))
      .toEqual({ figures: ['$6.20', '$6.80', '10%'], periods: ['two years ago'], directions: ['up'] });
    expect(lineFacts('Two years ago, coffee beans made up 25% of COGS.').directions).toEqual([]);   // "made up" is no rise
  });
});

describe('every version says what its ledger line says, to the checks', () => {
  const revealed = new Set(prof.dataLedger.map(i => i.id));
  it.each(ITEMS)('%s: names the same items, and no false fact once revealed', (id, { versions }) => {
    const ids = (t: string) => [...new Set(nameHits(t, fb).flatMap(h => h.quantities.map(q => q.id)))].sort();
    for (const v of versions) {
      expect(ids(v), v).toEqual(ids(versions[0]));
      expect(findFalseFacts(v, fb, revealed), v).toEqual([]);
    }
    void id;
  });
});

describe('behind DATA_LINE_VARIANTS', () => {
  afterEach(() => { delete process.env.DATA_LINE_VARIANTS; });
  const release = (id: string) => ({ correction: null, releases: [{ id, value: prof.dataLedger.find(i => i.id === id)!.value, earlier: false }], restates: [], exhibit: null, refusals: [], defers: [], gateDefers: [], unmappedDefer: false, offers: [] }) as never;
  it('off (the default): the ledger line, always', () => {
    for (const seed of ['a:1', 'b:2', 'c:3', 'd:4']) expect(renderDataLines(release('cogs_pct'), seed)).toEqual([prof.dataLedger.find(i => i.id === 'cogs_pct')!.value]);
  });
  it('on: one of the item\'s versions, the same for the same snapshot (Stream and Settle), varied across sessions', () => {
    process.env.DATA_LINE_VARIANTS = '1';
    const said = new Set<string>();
    for (const sid of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']) {
      const [line] = renderDataLines(release('cogs_pct'), `${sid}:5`);
      expect(file.items.cogs_pct.versions).toContain(line);
      expect(renderDataLines(release('cogs_pct'), `${sid}:5`)).toEqual([line]);
      said.add(line);
    }
    expect(said.size).toBeGreaterThan(1);
  });
  it('on: said again (restated), never one of the item\'s last 3 versions', () => {
    process.env.DATA_LINE_VARIANTS = '1';
    const value = prof.dataLedger.find(i => i.id === 'labor_pct')!.value;
    const restate = { correction: null, releases: [], restates: [{ id: 'labor_pct', value }], exhibit: null, refusals: [], defers: [], gateDefers: [], unmappedDefer: false, offers: [] } as never;
    let uses: PhraseUses = {};
    const seen: number[] = [];
    for (let turn = 0; turn < 20; turn++) {
      const [line] = renderDataLines(restate, `s:${turn}`, uses);
      const i = file.items.labor_pct.versions.findIndex(v => line.endsWith(v));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(seen.slice(-PHRASE_MEMORY)).not.toContain(i);
      seen.push(i);
      uses = recordPhraseUses(line, uses, dataLinePools());
    }
  });
  it('the loader indexes the versions by the ledger line they vary', () => {
    expect(dataLineVersions(prof.dataLedger[0].value)?.versions).toEqual(file.items[prof.dataLedger[0].id].versions);
    expect(dataLineVersions('not a ledger line')).toBeNull();
  });
});
