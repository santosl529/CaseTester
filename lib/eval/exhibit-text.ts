import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';

// The app renders exhibits in a panel beside the chat; a text-only simulated
// candidate sees none of it, so hand it the same data as a plain table. Run
// 58cb8061 lost three turns to "nothing is coming through" without this.
export function exhibitAsText(exhibit: ExhibitDisplay): string {
  const columns = [...new Set(exhibit.data.flatMap(row => Object.keys(row)))];
  const rows = exhibit.data.map(row => columns.map(c => String(row[c] ?? '')).join(' | '));
  // The UI shows the notes under the table (components/exhibit-table.tsx); so does the simulated candidate's copy.
  const note = exhibit.notes ? `\nNote: ${exhibit.notes}` : '';
  // Headers as the UI shows them: the display label where the exhibit has one (Matt, 17 Nov, exhibit clarity).
  return `[Exhibit shown: ${exhibit.title}]\n${columns.map(c => exhibit.columnLabels?.[c] ?? c).join(' | ')}\n${rows.join('\n')}${note}`;
}
