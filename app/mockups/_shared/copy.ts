// The final homepage copy (components/landing/content.ts, Matt's 21 Oct brief),
// verbatim, for the four mocked-up sections; and the product screens recaptured
// in the mockups' palette (public/mockups/, `--theme=ink-cobalt`).
import { DIAGNOSTIC_HREF, ROWS, SKILLS, STATS, TECH } from '@/components/landing/content';

export { DIAGNOSTIC_HREF, SKILLS, STATS, TECH };

export const HERO = {
  headline: 'A complete case interview training program, built around you.',
  subhead: 'Diagnostic, lessons, skill drills, and AI mock interviews, all in one comprehensive, personalized plan that adapts as you improve.',
  primary: 'Take the free diagnostic',
  secondary: 'See how it works',
};

export const ROW = ROWS[1];

export const TECH_INTRO = {
  eyebrow: 'The technology',
  headline: 'Engineered, not improvised.',
  subhead: 'General AI chatbots make up numbers, lose track of the case, and grade on vibes. Ours runs on specialized AI agents, code-enforced interview rules, and verification at every step, so the interviewer behaves like a real consultant and the feedback holds up.',
};

export interface Shot { src: string; width: number; height: number; narrow: { src: string; width: number; height: number }; alt: string }

export const HERO_SHOT: Shot = {
  src: '/mockups/hero.png', width: 1280, height: 1372,
  narrow: { src: '/mockups/hero-m.png', width: 720, height: 900 },
  alt: 'A student’s training home in CaseTester: week 2 of a 6-week Standard plan, and today’s workout of three drills, one done at 80%, with a Continue workout button.',
};

// Today's workout alone (the training home's top card, 480px wide), for
// concepts that draw their own skill map beside it.
export const WORKOUT_SHOT: Shot = {
  src: '/mockups/workout.png', width: 960, height: 900,
  narrow: { src: '/mockups/workout.png', width: 960, height: 900 },
  alt: 'Today’s workout in CaseTester: week 2 of a 6-week Standard plan, three drills (one done at 80%) and a Continue workout button.',
};

export const PLAN_SHOT: Shot = {
  src: '/mockups/plan.png', width: 1120, height: 1612,
  narrow: { src: '/mockups/plan-m.png', width: 720, height: 1092 },
  alt: 'A 7-day Sprint plan: a day-by-day schedule of workouts, cases and reviews, and the first workout of three drills with a Start button.',
};
