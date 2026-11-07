'use client';
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Media } from './content';

// A short product loop (homepage brief: muted, looping, with a pause control;
// no autoplay under reduced motion; lazy below the hero). The source is only
// attached when the video nears the viewport, and it plays only while visible.
// Phones and tablets get the narrow capture (decided once, on mount, before the source is attached).
const NARROW = '(max-width: 1023px)';

export function LoopVideo({ media, descriptionId, className = '', style }: { media: Media; descriptionId: string; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const clip = narrow ? media.mobile : media;
  // Set once the visitor presses pause (or never got autoplay): we don't resume behind their back.
  const userPaused = useRef(false);
  const visible = useRef(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const small = window.matchMedia(NARROW).matches;
    setNarrow(small);
    const source = small ? media.mobile.src : media.src;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) userPaused.current = true;
    const io = new IntersectionObserver(([entry]) => {
      visible.current = entry.isIntersecting;
      if (entry.isIntersecting) {
        setSrc(s => s ?? source);
        // Already attached: resume. Otherwise the effect below starts it once React has set the source.
        if (video.currentSrc && !userPaused.current) video.play().catch(() => setPlaying(false));
      } else if (!video.paused) {
        video.pause();
      }
    }, { rootMargin: '200px 0px' });
    io.observe(video);
    return () => io.disconnect();
  }, [media.src, media.mobile.src]);

  useEffect(() => {
    const video = ref.current;
    if (src && video && visible.current && !userPaused.current) video.play().catch(() => setPlaying(false));
  }, [src]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      userPaused.current = false;
      setSrc(s => s ?? (window.matchMedia(NARROW).matches ? media.mobile.src : media.src));
      video.play().catch(() => setPlaying(false));
    } else {
      userPaused.current = true;
      video.pause();
    }
  };

  return (
    <div>
      <div className="overflow-hidden rounded-[14px] bg-background ring-1 ring-foreground/10">
        <video
          ref={ref}
          src={src ?? undefined}
          poster={clip.poster}
          width={clip.width}
          height={clip.height}
          muted
          loop
          playsInline
          preload="none"
          aria-describedby={descriptionId}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className={`block h-auto w-full ${className}`}
          style={style}
        />
      </div>
      {/* Below the video, not over it: the control never hides the product. */}
      <button
        type="button"
        onClick={toggle}
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/20 bg-background px-3 text-sm font-medium outline-none transition-colors hover:border-foreground focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
      >
        {playing ? <Pause aria-hidden="true" className="size-3.5" /> : <Play aria-hidden="true" className="size-3.5" />}
        {playing ? 'Pause' : 'Play'}
        <span className="sr-only"> video</span>
      </button>
    </div>
  );
}
