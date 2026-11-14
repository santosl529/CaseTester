import { CASE_SCREENS } from '../_data/case';
import { SET_SCREENS } from '../_data/sets';
import { DRILL_SCREENS } from '../_data/drills';
import { INTERNAL_SCREENS } from '../_data/internal';
import type { Screen } from './types';

// Every preview screen, in the plan's areas (docs/ui-unification-plan.md §3).
export const SCREENS: Screen[] = [...SET_SCREENS, ...DRILL_SCREENS, ...CASE_SCREENS, ...INTERNAL_SCREENS];

export const AREAS = ['Auth', 'Onboarding', 'Diagnostic', 'Plan and dashboard', 'Lessons', 'Drills', 'Settings', 'Mock interview', 'Feedback', 'Internal', 'Other'];
