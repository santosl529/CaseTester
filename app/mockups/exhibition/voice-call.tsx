'use client';
import { memo } from 'react';
import { Mic } from 'lucide-react';
import { EXHIBIT } from './content';
import { Caption, Orb, Waveform } from './call';
import s from './exhibition.module.css';

// The live voice interview (Matt's brief, 24 Oct 2026), in one set of pieces
// shared by the homepage's device (What sets us apart, block 1) and chapter
// 01 on the product page, so the two match. From the product's voice page:
// live captions shown whole with words brightening as they're spoken, plain
// text with the speaker named, and exhibits shown in the call. From Matt's
// layout (the voice page doesn't draw these): the Live mark, the timer, the orb, the mic button, the waveform and "End
// interview". The controls are pictures (aria-hidden), the orb and waveform
// decorative; the captions and the exhibit are real text.

export type Speaker = 'Interviewer' | 'You';

// Left: the red Live dot and the case; right, the timer. (The case stages,
// Clarify to Recommendation, were taken out on 29 Oct, Matt.)
export function VoiceTopBar({ name, time, compact = false }: { name: string; time: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-4 border-b border-(--ink)/10 py-2.5 ${compact ? 'px-3' : 'px-4'}`}>
      <p className="t-small flex items-center gap-2 font-medium">
        <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full bg-(--live)" />Live<span className="font-normal text-(--ink)/65">· {name}</span>
      </p>
      <p className={`${s.figures} t-small ml-auto text-(--ink)/70`}><span className="sr-only">Call time </span>{time}</p>
    </div>
  );
}

// The interviewer's presence: the Cobalt orb, named. `who` is speaking now;
// its state reads as the voice page's own labels. The orb pulses while the
// interviewer speaks and `pulse` is on (only while the scroll is moving).
export const Presence = memo(function Presence({ who, pulse, size = 48 }: { who: Speaker | null; pulse: boolean; size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Orb speaking={pulse && who === 'Interviewer'} size={size} />
      <p className="t-small font-semibold">Interviewer <span className="font-normal text-(--ink)/65">· {who === 'Interviewer' ? 'Speaking' : who === 'You' ? 'Listening' : 'On the line'}</span></p>
    </div>
  );
});

// One caption: the speaker in small type over plain text. The newest line is
// full Ink, earlier ones lighter. `lit` words are shown; the rest hold their
// place (the full line is read out to screen readers either way).
// Memoized, and no colour transition: each word is its own element, and a
// long transcript re-colouring on every scrolled word cost frames (4x CPU).
export const CaptionLine = memo(function CaptionLine({ who, text, lit, newest, mark, markRef, className = 't-body' }: {
  who: Speaker; text: string; lit: number; newest: boolean; mark?: string; markRef?: React.Ref<HTMLElement>; className?: string;
}) {
  return (
    <>
      <p className={`t-label font-semibold ${who === 'You' ? 'text-(--cobalt)' : 'text-(--ink)/65'}`}>{who}</p>
      <Caption text={text} lit={lit} mark={mark} markRef={markRef} className={`${className} ${newest ? 'text-(--ink)' : 'text-(--ink)/60'}`} />
    </>
  );
});

// The shared exhibit. `compact`: the phone's smaller card.
export const ExhibitPanel = memo(function ExhibitPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`rounded-[10px] border border-(--ink)/12 bg-(--paper) ${compact ? 'px-3 py-2' : 'p-3'}`}>
      <p className="t-label font-semibold">{EXHIBIT.title}</p>
      <table className={`t-label w-full border-collapse text-left ${compact ? 'mt-1' : 'mt-2'}`}>
        <thead><tr className="border-b border-(--ink)/20"><th scope="col" className="py-1 pr-2 font-medium">Cost</th><th scope="col" className="py-1 pr-2 font-medium">2 yrs ago</th><th scope="col" className="py-1 font-medium">Now</th></tr></thead>
        <tbody>
          {EXHIBIT.rows.map(r => (
            <tr key={r.cost} className="border-b border-(--ink)/10 last:border-b-0">
              <th scope="row" className={`${compact ? 'py-0.5' : 'py-1'} pr-2 font-normal`}>{r.cost}</th>
              <td className={`${s.figures} ${compact ? 'py-0.5' : 'py-1'} pr-2`}>{r.before}</td>
              <td className={`${s.figures} ${compact ? 'py-0.5' : 'py-1'} ${r.before !== r.after ? 'font-semibold text-(--cobalt)' : ''}`}>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

// The call controls: the mic, live (Cobalt); the candidate's waveform beside
// it, moving while they speak; "End interview", quiet, on the right.
export const CallControls = memo(function CallControls({ speaking, still = false, compact = false }: { speaking: boolean; still?: boolean; compact?: boolean }) {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 border-t border-(--ink)/10 px-4 py-2.5">
      <span className={`${s.mic} flex flex-none items-center justify-center rounded-full bg-(--cobalt) text-(--white) ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}><Mic className="h-4 w-4" /></span>
      <Waveform speaking={speaking} still={still} bars={compact ? 16 : 28} className="h-7 min-w-0 flex-1 overflow-hidden" />
      <span className="t-small flex h-8 flex-none items-center rounded-full border border-(--ink)/20 px-3 font-medium text-(--ink)/80">End interview</span>
    </div>
  );
});

// A conversation's timing in word steps: a beat, then each line word by
// word with a gap after it. `pos` (a whole step) gives what is showing.
export function wordSteps(lines: { text: string }[], { lead = 1, gap = 2, tail = 2 } = {}) {
  let at = lead;
  const spans = lines.map(l => {
    const start = at;
    const len = l.text.split(/\s+/).filter(Boolean).length;
    at = start + len + gap;
    return { start, len };
  });
  return { spans, total: at - gap + tail };
}

export function stepState(spans: { start: number; len: number }[], pos: number) {
  const started = spans.map(sp => pos >= sp.start);
  const lit = spans.map(sp => Math.max(0, Math.min(sp.len, pos - sp.start + 1)));
  const done = spans.map(sp => pos >= sp.start + sp.len);
  const speakingAt = spans.findIndex((sp, i) => started[i] && !done[i]);
  return { started, lit, done, speakingAt, newest: started.lastIndexOf(true) };
}
