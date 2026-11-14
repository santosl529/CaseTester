import { SiteFooter, TopBar } from './chrome';
import s from './exhibition.module.css';

// The policy pages (Matt, 13 Nov 2026): the Privacy Policy and the Voice and
// Biometric Data Policy, linked from the footer. A reading page in the
// exhibition's type roles: one column at a comfortable measure.

const WRAP = 'mx-auto w-full max-w-[1240px] px-6 lg:px-12';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div data-exhibition className="flex-1 bg-(--paper)">
      <TopBar />
      <main className="border-t border-(--ink)/12">
        <article className={`${WRAP} pt-14 pb-24 sm:pt-20 lg:pt-24`}>
          <div className="max-w-[42rem]">
            <h1 className={`${s.display} t-section text-balance`}>{title}</h1>
            <p className="t-small mt-4 text-(--ink)/70">Last updated {updated}</p>
            <div className="mt-10 space-y-12 sm:mt-14">{children}</div>
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="t-body space-y-4 text-(--ink)/85">
      <h2 id={id} className="t-card scroll-mt-8 font-semibold text-(--ink)">{title}</h2>
      {children}
    </section>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-(--ink)/40">{children}</ul>;
}

// A two- or three-column table; scrolls on its own if a phone is too narrow.
export function Table({ label, head, rows }: { label: string; head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto">
      <table className="t-small w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-(--ink)/20">
            {head.map(h => <th key={h} scope="col" className="py-2 pr-6 font-semibold text-(--ink)">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-(--ink)/10 align-top">
              {r.map((c, j) => j === 0
                ? <th key={j} scope="row" className="py-2.5 pr-6 font-semibold text-(--ink)">{c}</th>
                : <td key={j} className="py-2.5 pr-6">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
