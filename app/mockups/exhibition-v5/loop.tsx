import { CountUp } from '../_shared/count-up';
import { STATS } from '../_shared/copy';
import { LOOP_INTRO, NODES } from './content';
import s from './exhibition.module.css';

// The stats band and the loop diagram (Matt's brief, 23 Oct 2026, v2).

export function StatsBand() {
  return (
    <section aria-labelledby="ex-stats" data-shot="stats" data-theme="light" data-surface="paper" className="border-y border-(--rule)">
      <h2 id="ex-stats" className="sr-only">CaseTester at a glance</h2>
      <dl className="mx-auto grid w-full max-w-[1240px] grid-cols-2 px-6 lg:grid-cols-5 lg:px-12">
        {STATS.map((st, i) => (
          <div key={st.label} className={[
            'flex flex-col-reverse justify-end gap-4 border-(--ink)/12 py-10 lg:py-16',
            i === 4 ? 'col-span-2 border-t lg:col-span-1 lg:border-t-0' : '',
            i >= 2 && i < 4 ? 'border-t lg:border-t-0' : '',
            i % 2 === 1 && i < 4 ? 'border-l pl-5' : 'pr-5',
            i > 0 ? 'lg:border-l lg:pl-6' : '',
            i === 4 ? 'lg:pr-0' : '',
          ].join(' ')}>
            <dt className="t-small max-w-[15rem] text-(--text-2)">{st.label}</dt>
            <dd className="flex flex-col gap-4">
              <CountUp value={st.value} duration={800} linear className={`${s.display} ${s.figures} t-display`} />
              <span aria-hidden="true" className={s.statRule} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Arrow({ dir, className = '' }: { dir: 'down' | 'right'; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 10 6" className={`h-1.5 w-2.5 fill-(--ink) ${dir === 'right' ? '-rotate-90' : ''} ${className}`}><path d="M0 0h10L5 6z" /></svg>
  );
}

function Node({ node, entry = false }: { node: typeof NODES[number]; entry?: boolean }) {
  return (
    <a href={`#${node.id}`} className={`${s.node} group block h-full rounded-[10px] border p-4 ${entry ? 'border-(--ink) bg-(--ink) text-(--white)' : 'border-(--ink)/20 bg-(--white)'}`}>
      <span className={`${s.nodeLabel} t-body block font-semibold transition-colors ${entry ? 'group-hover:text-(--sky)' : ''}`}>{node.label}</span>
      <span className={`t-small mt-1.5 block ${entry ? 'text-(--sky)' : 'text-(--ink)/70'}`}>{node.description}</span>
    </a>
  );
}

const DOWN = <div aria-hidden="true" className="flex h-8 flex-col items-center"><span className="w-0 flex-1 border-l-[1.5px] border-(--ink)" /><Arrow dir="down" /></div>;

export function LoopSection() {
  const [diagnose, ...loop] = NODES;
  return (
    <section aria-labelledby="ex-loop-h" id="how" data-shot="loop" data-theme="light" data-surface="paper" className="scroll-mt-4 py-24 lg:py-36">
      <div className="mx-auto w-full max-w-[1240px] px-6 lg:px-12">
        <h2 id="ex-loop-h" className={`${s.display} t-section max-w-[16ch] text-balance`}>{LOOP_INTRO.headline}</h2>
        <p className="t-body mt-7 max-w-[42rem] text-(--text-2)">{LOOP_INTRO.subhead}</p>

        <nav aria-label="The training loop" className="mt-16">
          <p className="sr-only">Diagnose first, once. Then the loop: Your plan, Learn, Drill, Mock interview, Plan updates, and back to Your plan. Each step links to its chapter below.</p>
          {/* Desktop: Diagnose above Your plan, the five loop steps in a row, the return path under them. */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr)_2.5rem)_minmax(0,1fr)]">
              <div><Node node={diagnose} entry /></div>
            </div>
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr)_2.5rem)_minmax(0,1fr)]"><div>{DOWN}</div></div>
            <ol className="grid grid-cols-[repeat(4,minmax(0,1fr)_2.5rem)_minmax(0,1fr)] items-stretch">
              {loop.map((n, i) => (
                <li key={n.id} className="contents">
                  <div><Node node={n} /></div>
                  {i < loop.length - 1 && <div aria-hidden="true" className="flex items-center px-1.5"><span className="h-0 flex-1 border-t-[1.5px] border-(--ink)" /><Arrow dir="right" className="-ml-0.5" /></div>}
                </li>
              ))}
            </ol>
            <div aria-hidden="true" className="relative h-9">
              <span className="absolute top-0 bottom-0 border-x-[1.5px] border-b-[1.5px] border-(--cobalt)" style={{ left: 'calc((100% - 10rem) / 10)', right: 'calc((100% - 10rem) / 10)' }} />
              <svg viewBox="0 0 10 6" className="absolute -top-1.5 h-1.5 w-2.5 -translate-x-1/2 rotate-180 fill-(--cobalt)" style={{ left: 'calc((100% - 10rem) / 10 + 0.75px)' }}><path d="M0 0h10L5 6z" /></svg>
              <span className="t-label absolute top-3 font-medium text-(--cobalt)" style={{ left: 'calc((100% - 10rem) / 10 + 1rem)' }}>Repeat until you’re ready</span>
            </div>
          </div>

          {/* Phones: a column, the return line up the left side. */}
          <div className="lg:hidden">
            <Node node={diagnose} entry />
            {DOWN}
            <ol className="relative pl-8">
              <span aria-hidden="true" className="absolute top-10 bottom-10 left-2 w-4 rounded-l-md border-y-[1.5px] border-l-[1.5px] border-(--cobalt)">
                <svg viewBox="0 0 10 6" className="absolute -top-[4px] -right-1.5 h-1.5 w-2.5 -rotate-90 fill-(--cobalt)"><path d="M0 0h10L5 6z" /></svg>
              </span>
              {loop.map((n, i) => (
                <li key={n.id}>
                  <Node node={n} />
                  {i < loop.length - 1 && DOWN}
                </li>
              ))}
            </ol>
          </div>
        </nav>
      </div>
    </section>
  );
}
