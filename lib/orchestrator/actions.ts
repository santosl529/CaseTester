export type SpeakAction    = { type: 'speak';         text: string };
export type RevealAction   = { type: 'reveal_data';   itemId: string };
export type ExhibitAction  = { type: 'show_exhibit';  exhibitId: string };
export type AdvanceAction  = { type: 'advance_phase' };
export type EndCaseAction  = { type: 'end_case' };

export type Action =
  | SpeakAction
  | RevealAction
  | ExhibitAction
  | AdvanceAction
  | EndCaseAction;
