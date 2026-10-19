// Checks logged drills events against their key properties (event-props.ts):
// used by the smoke scripts and the pilot reports ("all events firing").
import { DRILL_EVENT_PROPS, type DrillEvent } from './event-props';

// Carried by every drills event (PRD "Events").
export const COMMON_EVENT_PROPS = ['student_id', 'org_id', 'taxonomy_version', 'app_version'] as const;

export interface EventAudit {
  // Rows per drills event type.
  seen: Map<DrillEvent, number>;
  // One line per row missing a key property: "<event> <id>: no <prop>, <prop>".
  incomplete: string[];
}

export function auditEventRows(rows: { id: string; eventType: string; payload: unknown }[]): EventAudit {
  const seen = new Map<DrillEvent, number>();
  const incomplete: string[] = [];
  for (const r of rows) {
    if (!(r.eventType in DRILL_EVENT_PROPS)) continue;
    const type = r.eventType as DrillEvent;
    seen.set(type, (seen.get(type) ?? 0) + 1);
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    const missing = [...COMMON_EVENT_PROPS, ...DRILL_EVENT_PROPS[type]].filter(k => !(k in payload));
    if (missing.length) incomplete.push(`${type} ${r.id}: no ${missing.join(', ')}`);
  }
  return { seen, incomplete };
}

// Drills events with no rows.
export const missingEvents = (seen: Map<DrillEvent, number>): DrillEvent[] =>
  (Object.keys(DRILL_EVENT_PROPS) as DrillEvent[]).filter(e => !seen.has(e));
