import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DRILL_EVENT_PROPS, EVENTS_NOT_IN_PRD, type DrillEvent } from '@/lib/drills/event-props';
import { auditEventRows, missingEvents } from '@/lib/drills/event-audit';

// The PRD's "Events" table, parsed: each row's event names and key properties.
// "`prescription_created` / `_dismissed`" expands to prescription_dismissed;
// "item ref (id + version, …)" is item_ref; P1 rows are skipped.
function prdRows(): { events: string[]; props: string[] }[] {
  const prd = fs.readFileSync('docs/prd-drills.md', 'utf-8');
  const section = prd.slice(prd.indexOf('### Events'), prd.indexOf('### MVP reports'));
  return section.split('\n').filter(l => l.startsWith('| `')).flatMap(line => {
    const [names, , props] = line.split('|').slice(1, 4).map(c => c.trim());
    if (names.includes('(P1)')) return [];
    const parts = [...names.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    const first = parts[0];
    const events = parts.map(p => (p.startsWith('_') ? first.slice(0, first.lastIndexOf('_')) + p : p));
    const list = props === '—' ? [] : props.replace(/\\_/g, '_').replace(/\([^)]*\)/g, '').split(',').map(p => p.trim().replace(/\s+/g, '_')).filter(Boolean);
    return [{ events, props: list }];
  });
}

const code = DRILL_EVENT_PROPS as Record<string, readonly string[]>;

describe('analytics events (PRD "Events")', () => {
  const rows = prdRows();

  it('parses the PRD table', () => {
    expect(rows.length).toBeGreaterThan(25);
  });

  it('every PRD event is defined, with exactly the row\'s key properties', () => {
    for (const row of rows) {
      for (const e of row.events) {
        expect(code[e], e).toBeDefined();
        for (const p of code[e]) expect(row.props, `${e}.${p}`).toContain(p);
      }
      // Events sharing a row cover its properties between them.
      const union = new Set(row.events.flatMap(e => code[e] ?? []));
      expect([...union].sort(), row.events.join(' / ')).toEqual([...row.props].sort());
    }
  });

  it('every defined event is in the PRD, or listed as not in it yet', () => {
    const inPrd = new Set(rows.flatMap(r => r.events));
    const extra = Object.keys(code).filter(e => !inPrd.has(e));
    expect(extra.sort()).toEqual([...EVENTS_NOT_IN_PRD].sort());
  });

  it('every defined event is logged somewhere in the code', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, d.name);
        if (d.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(d.name) && !full.endsWith('event-props.ts')) files.push(fs.readFileSync(full, 'utf-8'));
      }
    };
    walk('lib');
    walk('app');
    const source = files.join('\n');
    const unused = (Object.keys(code) as DrillEvent[]).filter(e => !source.includes(`'${e}'`));
    expect(unused).toEqual([]);
  });
});

describe('event audit', () => {
  const common = { student_id: 's', org_id: null, taxonomy_version: 'v1', app_version: 'dev' };
  it('flags rows missing a key property, counting null as present', () => {
    const { seen, incomplete } = auditEventRows([
      { id: '1', eventType: 'drill_set_expired', payload: { ...common, set_id: 'x', items_completed: null } },
      { id: '2', eventType: 'drill_set_expired', payload: { ...common, set_id: 'x' } },
      { id: '3', eventType: 'session_started', payload: {} },
    ]);
    expect(seen.get('drill_set_expired')).toBe(2);
    expect(seen.has('session_started' as DrillEvent)).toBe(false);
    expect(incomplete).toEqual(['drill_set_expired 2: no items_completed']);
  });
  it('lists events with no rows', () => {
    const missing = missingEvents(new Map([['drill_set_expired', 1]]));
    expect(missing).not.toContain('drill_set_expired');
    expect(missing).toContain('drills_home_viewed');
  });
});

