import { memo } from 'react';
import s from './exhibition.module.css';

// The voice interview's pieces, recreated from the product's voice page: the
// interviewer is an abstract Cobalt orb (never a face), the candidate a
// waveform, and captions are real text that light up word by word as they're
// spoken (the product shows each caption brightening as it plays).

// Memoized: the scroll-scrubbed chapters re-render often, these rarely change.
export const Orb = memo(function Orb({ speaking, size = 44 }: { speaking: boolean; size?: number }) {
  return (
    <span aria-hidden="true" data-speaking={speaking} className={s.orb} style={{ width: size, height: size }}>
      <span className={s.orbCore} />
    </span>
  );
});

// Bar heights and speeds, fixed so server and client agree.
const BARS = [10, 18, 26, 14, 22, 30, 16, 24, 12, 28, 20, 14, 26, 18, 30, 12, 22, 16, 28, 10, 24, 18, 14, 26, 20, 12, 22, 16];

export const Waveform = memo(function Waveform({ speaking, bars = BARS.length, className = '' }: { speaking: boolean; bars?: number; className?: string }) {
  return (
    <span aria-hidden="true" data-speaking={speaking} className={`${s.wave} ${className}`}>
      {BARS.slice(0, bars).map((h, i) => (
        <span key={i} style={{ '--h': `${h}px`, '--d': `${380 + (i % 5) * 90}ms` } as React.CSSProperties} />
      ))}
    </span>
  );
});

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

// A caption: the full text for assistive tech; on screen, words appear as lit.
// `mark` highlights a phrase in Sky (its element exposed through markRef).
export const Caption = memo(function Caption({ text, lit: litWords, mark, markRef, className = '' }: { text: string; lit: number; mark?: string; markRef?: React.Ref<HTMLElement>; className?: string }) {
  // A finished line lights every token, punctuation split off by a mark included.
  const lit = litWords >= wordCount(text) ? Infinity : litWords;
  const at = mark ? text.indexOf(mark) : -1;
  const parts = at < 0
    ? [{ text, marked: false }]
    : [{ text: text.slice(0, at), marked: false }, { text: mark!, marked: true }, { text: text.slice(at + mark!.length), marked: false }];
  // Words with the space before them (so lit text never jumps), numbered across parts.
  const tokenized = parts.map(p => {
    const tokens = p.text.match(/\s*\S+/g) ?? [];
    const trailing = p.text.match(/\s+$/)?.[0] ?? '';
    return { ...p, tokens: tokens.map((t, k) => (k === tokens.length - 1 ? t + trailing : t)) };
  });
  const starts = tokenized.reduce<number[]>((acc, p, k) => [...acc, k === 0 ? 0 : acc[k - 1] + tokenized[k - 1].tokens.length], []);
  const segment = (tokens: string[], first: number) => tokens.map((tok, k) => (
    <span key={k} className={s.word} data-lit={first + k < lit}>{tok}</span>
  ));
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {tokenized.map((p, k) => p.marked ? (
          <mark key={k} ref={markRef as React.Ref<HTMLElement>} className={`${s.mark} text-(--ink)`} data-full={starts[k] + p.tokens.length <= lit}>
            {segment(p.tokens, starts[k])}
          </mark>
        ) : <span key={k}>{segment(p.tokens, starts[k])}</span>)}
      </span>
    </p>
  );
});
