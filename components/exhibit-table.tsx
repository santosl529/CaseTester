// An exhibit as a table — shared by the text chat and the voice page. In the
// homepage's window, its label above ("Exhibit · …").
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';
import { Exhibit } from '@/components/brand/window';

export function ExhibitTable({ exhibit }: { exhibit: ExhibitDisplay }) {
  const columns = Object.keys(exhibit.data[0] ?? {});
  return (
    <Exhibit label="Exhibit" title={exhibit.title} className="mt-3 text-ink">
      {/* A wide table scrolls in its own box; focusable so the keyboard can scroll it. */}
      <div role="region" aria-label={`${exhibit.title}: table`} tabIndex={0} className="overflow-x-auto">
        <table className="t-small w-full border-collapse">
          <thead>
            <tr className="text-ink/70">
              {columns.map(col => (
                <th key={col} className="border-b border-ink/20 px-3 py-2 text-left font-medium whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exhibit.data.map((row, i) => (
              <tr key={i} className="border-b border-ink/10 last:border-b-0">
                {columns.map((col, j) => (
                  <td key={col} className={`px-3 py-2 whitespace-nowrap tabular-nums ${j === 0 ? 'font-medium' : ''}`}>
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exhibit.notes && (
        <p className="t-label border-t border-ink/10 px-3 py-2 text-ink/70">
          {exhibit.notes}
        </p>
      )}
    </Exhibit>
  );
}
