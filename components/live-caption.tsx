'use client';
// An interviewer caption shown whole (item 7, 18 Oct): each segment's words
// dimmed, brightened at their start — timed locally from the message's
// arrival plus the audio offset (?captionOffset=<ms>, default 150).
import { useEffect, useState } from 'react';
import { brightTokens, captionOffsetFrom } from '@/lib/voice/caption-timing';
import type { CaptionSegment } from '@/components/voice-view';

export function LiveCaption({ segments }: { segments: CaptionSegment[] }) {
  const [now, setNow] = useState(() => performance.now());
  const [offset] = useState(() => (typeof window === 'undefined' ? captionOffsetFrom('') : captionOffsetFrom(window.location.search)));
  const split = segments.map(s => {
    const n = brightTokens(s.words, now - s.at - offset);
    const cut = n === 0 ? 0 : (s.words[n - 1]?.end ?? s.text.length);
    return { key: s.index, lit: s.text.slice(0, cut), dim: s.text.slice(cut), done: n >= s.words.length };
  });
  const done = split.every(x => x.done);
  useEffect(() => {
    if (done) return;
    let id = requestAnimationFrame(function tick() { setNow(performance.now()); id = requestAnimationFrame(tick); });
    return () => cancelAnimationFrame(id);
  }, [done]);
  return (
    <span>
      {split.map((x, i) => (
        <span key={x.key}>
          {i > 0 ? ' ' : ''}{x.lit}<span className="text-neutral-400">{x.dim}</span>
        </span>
      ))}
    </span>
  );
}
