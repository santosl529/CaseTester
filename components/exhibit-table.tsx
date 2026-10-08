// An exhibit as a table — shared by the text chat and the voice page.
import type { ExhibitDisplay } from '@/lib/orchestrator/turn-types';

export function ExhibitTable({ exhibit }: { exhibit: ExhibitDisplay }) {
  const columns = Object.keys(exhibit.data[0] ?? {});
  return (
    <div className="mt-3 rounded-lg border border-neutral-200 overflow-hidden text-xs">
      <div className="bg-neutral-50 px-3 py-2 font-medium text-neutral-700 border-b border-neutral-200">
        {exhibit.title}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-neutral-50">
            <tr>
              {columns.map(col => (
                <th key={col} className="px-3 py-2 text-left font-medium text-neutral-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exhibit.data.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                {columns.map(col => (
                  <td key={col} className="px-3 py-2 text-neutral-800 whitespace-nowrap">
                    {String(row[col] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
