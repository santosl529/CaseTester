import { getImageProps } from 'next/image';
import type { Shot } from './copy';

// A product screen, art-directed: the narrow capture below 1024px (where the
// mockups stack), the full one above. The box keeps each capture's shape.
export function ShotImage({ shot, sizes, priority = false, className = '' }: { shot: Shot; sizes: string; priority?: boolean; className?: string }) {
  const { props: { srcSet: narrow } } = getImageProps({ alt: '', src: shot.narrow.src, width: shot.narrow.width, height: shot.narrow.height, sizes: '448px', priority });
  const { props: { srcSet: wide, ...img } } = getImageProps({ alt: shot.alt, src: shot.src, width: shot.width, height: shot.height, sizes, priority });
  return (
    <picture>
      <source media="(max-width: 1023px)" srcSet={narrow} />
      <source media="(min-width: 1024px)" srcSet={wide} />
      <img {...img} src={img.src} alt={shot.alt} className={`block h-auto w-full ${className}`} />
    </picture>
  );
}
