// The CasePace characters on the "What sets us apart" slides (Matt's brief,
// 25 Oct 2026). The art is interim until the commissioned illustrations
// arrive: replace a file in public/landing/characters/ (or change a path
// here) and every slide follows. Quotes are stored without their curly
// quotes; the slides add them.

export type CharacterId = 'graham' | 'valeria' | 'imani' | 'kai';

export interface Character { name: string; role: string; quote: string; src: string }

export const CHARACTERS: Record<CharacterId, Character> = {
  graham: { name: 'Graham', role: 'AI interviewer', quote: 'Before we go further, what’s your hypothesis?', src: '/landing/characters/graham-leaning.svg' },
  valeria: { name: 'Valeria', role: 'AI planner', quote: '25 days to go. That means a workout today, not tomorrow.', src: '/landing/characters/valeria-watch-tap.svg' },
  imani: { name: 'Imani', role: 'AI teacher', quote: 'Here’s the trick most people miss.', src: '/landing/characters/imani-whiteboard.svg' },
  kai: { name: 'Kai', role: 'AI drills coach', quote: 'Three in a row. Now go faster.', src: '/landing/characters/kai-stopwatch.svg' },
};

// Who appears on each slide, in order (slide 3: Imani, then Kai).
export const SLIDE_CAST: CharacterId[][] = [['graham'], ['valeria'], ['imani', 'kai']];
