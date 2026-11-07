import { ArrowDown } from 'lucide-react';
import styles from './landing.module.css';
import { DIAGNOSTIC_STEP, LOOP_STEPS, UPDATE_STEP, type LoopStep } from './content';

// "How it works" (homepage brief §2): the free diagnostic once, then the loop
// Your plan → Learn → Drill → Mock interview → Plan updates → back to Your
// plan. Real links and text; the lines and arrowheads are decoration. Desktop
// (1024px and up) is a 7-column grid (boxes 4fr, connectors 1fr); phones stack the boxes with
// the return line running up the left side.

const LINE = 'border-foreground';

function Head({ dir, className = '' }: { dir: 'down' | 'right' | 'up'; className?: string }) {
  const rotate = dir === 'down' ? '' : dir === 'right' ? '-rotate-90' : 'rotate-180';
  return (
    <svg aria-hidden="true" viewBox="0 0 10 6" className={`h-1.5 w-2.5 fill-foreground ${rotate} ${className}`}>
      <path d="M0 0h10L5 6z" />
    </svg>
  );
}

// A vertical connector with its head at the bottom.
function Down({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`flex h-10 flex-col items-center ${className}`}>
      <span className={`w-0 flex-1 border-l-[1.5px] ${LINE}`} />
      <Head dir="down" />
    </div>
  );
}

function Right({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`items-center px-2 ${className}`}>
      <span className={`h-0 flex-1 border-t-[1.5px] ${LINE}`} />
      <Head dir="right" className="-ml-0.5" />
    </div>
  );
}

function Box({ step, tone = 'plain', className = '' }: { step: LoopStep; tone?: 'plain' | 'ink' | 'mist'; className?: string }) {
  const ink = tone === 'ink';
  return (
    <a
      id={`loop-${step.id}`}
      href={`#${step.id}`}
      className={`${styles.box} group block h-full scroll-mt-24 rounded-[10px] border p-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2 ${
        ink
          ? 'border-foreground bg-foreground text-background hover:bg-foreground/90'
          : `border-foreground/20 text-foreground hover:border-foreground ${tone === 'mist' ? 'bg-muted' : 'bg-background'}`
      } ${className}`}
    >
      <span className="block text-base font-semibold leading-snug">
        {step.label.split(' ').slice(0, -1).join(' ')}{step.label.includes(' ') ? ' ' : ''}
        <span className="whitespace-nowrap">{step.label.split(' ').at(-1)}<ArrowDown aria-hidden="true" strokeWidth={2} className={`ml-1 inline-block size-3.5 align-[-1px] transition-transform group-hover:translate-y-0.5 ${ink ? 'text-background/70' : 'text-neutral-500'}`} /></span>
      </span>
      <span className={`mt-1 block text-sm leading-relaxed ${ink ? 'text-background/80' : 'text-neutral-600'}`}>{step.description}</span>
    </a>
  );
}

export function LoopDiagram() {
  const [plan, learn, drill, mock] = LOOP_STEPS;
  return (
    <div className="mx-auto max-w-5xl">
      <p className="sr-only">
        Start with the free diagnostic, once. Then the loop: Your plan, Learn, Drill, Mock interview, then Plan updates, which leads back to Your plan. Each step links to its section below.
      </p>
      <div className="flex flex-col lg:grid lg:grid-cols-[4fr_1fr_4fr_1fr_4fr_1fr_4fr] lg:grid-rows-[auto_2.5rem_auto_2.5rem_auto]">
        <Box step={DIAGNOSTIC_STEP} tone="ink" className="lg:col-start-1 lg:row-start-1" />
        <Down className="lg:col-start-1 lg:row-start-2" />

        {/* The loop. On phones it's its own column with the return line beside it; on desktop its children join the grid. */}
        <div className="relative flex flex-col pl-8 lg:contents">
          <div aria-hidden="true" className={`absolute top-8 bottom-8 left-1 w-5 rounded-l-md border-y-[1.5px] border-l-[1.5px] lg:hidden ${LINE}`}>
            <Head dir="right" className="absolute -top-[4.5px] -right-1.5" />
          </div>

          <Box step={plan} className="lg:col-start-1 lg:row-start-3" />
          <Down className="lg:hidden" />
          <Right className="hidden lg:col-start-2 lg:row-start-3 lg:flex" />
          <Box step={learn} className="lg:col-start-3 lg:row-start-3" />
          <Down className="lg:hidden" />
          <Right className="hidden lg:col-start-4 lg:row-start-3 lg:flex" />
          <Box step={drill} className="lg:col-start-5 lg:row-start-3" />
          <Down className="lg:hidden" />
          <Right className="hidden lg:col-start-6 lg:row-start-3 lg:flex" />
          <Box step={mock} className="lg:col-start-7 lg:row-start-3" />
          <Down className="lg:col-start-7 lg:row-start-4" />
          <Box step={UPDATE_STEP} tone="mist" className="lg:col-start-7 lg:row-start-5" />

          {/* Desktop return path: from Plan updates left to under Your plan, then up into it. */}
          <div aria-hidden="true" className="relative hidden lg:col-start-1 lg:col-end-7 lg:row-start-4 lg:row-end-6 lg:block">
            <span className={`absolute top-0 left-[13.333%] h-[calc(50%+1.25rem)] border-l-[1.5px] ${LINE}`} />
            <span className={`absolute top-[calc(50%+1.25rem)] right-0 left-[13.333%] border-t-[1.5px] ${LINE}`} />
            <Head dir="up" className="absolute top-0 left-[13.333%] -translate-x-[calc(50%-0.75px)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
