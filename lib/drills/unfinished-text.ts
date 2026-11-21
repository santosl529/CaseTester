// One unfinished set at a time (Matt, 21 Nov): the choice's text, approved by Matt. Plain module, so server pages
// (Today's Unfinished rows, a set-aside set's page) and the client dialog (components/drills/use-start-set.tsx) share it.
export interface Unfinished {
  set_id: string; drill_name: string; done: number; size: number; workout: boolean; diagnostic: boolean;
  wanted: { drill_name: string };
}

// Text approved by Matt (21 Nov).
export const UNFINISHED_TITLE = 'You have an unfinished set';
export const unfinishedLine = (u: Pick<Unfinished, 'drill_name' | 'done' | 'size'>) => `${u.drill_name} · ${u.done} of ${u.size} done`;
export const resumeLabel = (u: Unfinished) => `Resume ${u.drill_name}`;
export const insteadLabel = (u: Unfinished) => `Start ${u.wanted.drill_name} instead`;
export const unfinishedNote = (u: Pick<Unfinished, 'workout'>) => u.workout
  ? 'Your answers are saved. Today’s workout picks it up where you left off.'
  : 'Your answers are saved. Resume it any time from Today.';

