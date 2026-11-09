// "Delete my account" (Lorenzo, 9 Nov: everything personal; cost/usage logs kept with the user id removed).
// The plan is checked against db/schema.ts itself, so a table added later that holds a student's data — directly
// (user_id / student_id) or through a foreign key to such a table — fails here until the plan covers it.
import { describe, it, expect, vi } from 'vitest';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

vi.mock('@/db/client', () => ({ db: {} }));
const schema = await import('@/db/schema');
const { DELETE_PLAN, KEPT_TABLES } = await import('@/lib/account/delete-plan');

const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => t instanceof PgTable).map(t => getTableConfig(t));
const nameOf = (t: PgTable) => getTableConfig(t).name;
const planned = DELETE_PLAN.map(s => nameOf(s.table));

// Personal: a user_id/student_id column, or a foreign key into a personal table (to a fixed point).
function personalTables(): Set<string> {
  const personal = new Set(tables.filter(c => c.columns.some(col => col.name === 'user_id' || col.name === 'student_id')).map(c => c.name));
  for (let grew = true; grew;) {
    grew = false;
    for (const c of tables) {
      if (personal.has(c.name)) continue;
      if (c.foreignKeys.some(fk => personal.has(getTableConfig(fk.reference().foreignTable).name))) { personal.add(c.name); grew = true; }
    }
  }
  return personal;
}

describe('the delete plan', () => {
  it('covers every table that holds a student’s data', () => {
    const missing = [...personalTables()].filter(t => !planned.includes(t) && !(t in KEPT_TABLES));
    expect(missing).toEqual([]);
  });
  it('analytics events are kept with the user and session ids removed; everything else personal is deleted', () => {
    const analytics = DELETE_PLAN.filter(s => nameOf(s.table) === 'analytics_events');
    expect(analytics.map(s => s.action)).toEqual(['anonymize']);
    expect(DELETE_PLAN.filter(s => s.action === 'anonymize').map(s => nameOf(s.table))).toEqual(['analytics_events']);
  });
  it('the rate-limit counters keyed by the user go too', () => {
    expect(DELETE_PLAN.some(s => nameOf(s.table) === 'rate_limits' && s.scope === 'rateLimitKeys')).toBe(true);
  });
  it('a child is cleared before the parent it references (no foreign-key error mid-delete)', () => {
    for (const c of tables) {
      for (const fk of c.foreignKeys) {
        const parent = getTableConfig(fk.reference().foreignTable).name;
        const ci = planned.indexOf(c.name), pi = planned.lastIndexOf(parent);
        if (ci >= 0 && pi >= 0) expect({ child: c.name, parent, before: ci < pi }).toEqual({ child: c.name, parent, before: true });
      }
    }
  });
  it('only tables with no student in them are kept whole', () => {
    expect(Object.keys(KEPT_TABLES).filter(t => personalTables().has(t))).toEqual([]);
  });
});
