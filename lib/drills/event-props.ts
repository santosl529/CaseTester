// The key properties each drills analytics event must carry, from the PRD's
// "Events" table (docs/prd-drills.md "Analytics and event logging"). The type
// of logDrillEvent requires them at every call, and a test keeps this list in
// step with the PRD. Events sharing a PRD row ("workout_built / _completed")
// share its properties, except where one can't know a value yet
// (minutes_actual before a workout is done). Extra properties are allowed.
export const DRILL_EVENT_PROPS = {
  drills_home_viewed: ['track', 'week', 'open_prescriptions', 'interview_days_out'],
  drill_set_started: ['set_id', 'drill_id', 'level', 'stage', 'tier', 'source', 'prescription_id', 'focus_tag', 'slot', 'suggested'],
  drill_example_viewed: ['drill_id'],
  drill_example_skipped: ['drill_id'],
  drill_item_served: ['set_id', 'position', 'item_ref'],
  drill_attempt_submitted: ['attempt_id', 'score', 'time_ms', 'timed_out', 'skipped', 'mistake_tags'],
  drill_set_completed: ['set_id', 'set_score', 'passed', 'duration_ms', 'skill_scores'],
  drill_set_expired: ['set_id', 'items_completed'],
  grading_job_completed: ['job_id', 'status', 'retries', 'latency_ms', 'input_tokens', 'output_tokens', 'cost_usd'],
  grading_injection_suspected: ['attempt_id'],
  // D3: the loop.
  skill_state_changed: ['skill_id', 'from_state', 'to_state', 'source_type'],
  prescription_created: ['prescription_id', 'skill_id', 'drill_id', 'source_type', 'priority'],
  prescription_dismissed: ['prescription_id', 'skill_id', 'drill_id', 'source_type', 'priority'],
  prescription_completed: ['prescription_id', 'skill_id', 'drill_id', 'source_type', 'priority'],
  next_case_card_shown: ['recommended_case_id'],
  next_case_card_clicked: ['recommended_case_id'],
  case_result_received: ['case_attempt_id', 'case_type', 'difficulty_tier', 'finding_count'],
  transfer_check_completed: ['skill_id', 'score', 'passed', 'attempt_number'],
  prerequisite_prescribed: ['skill_id', 'prerequisite_id'],
  transfer_pool_exhausted: ['skill_id', 'drill_id'],
  // D4: the training program.
  onboarding_completed: ['track_suggested', 'interview_days_out', 'cases_done', 'workouts_per_week'],
  diagnostic_completed: ['overall_score', 'placements'],
  program_assigned: ['track', 'plan_version', 'reason'],
  program_switched: ['track', 'plan_version', 'reason'],
  program_week_started: ['week', 'milestones_met'],
  workout_built: ['workout_id', 'blocks', 'minutes_target'],
  workout_completed: ['workout_id', 'blocks', 'minutes_target', 'minutes_actual'],
  lesson_viewed: ['lesson_id', 'skill_id', 'source', 'seconds_open'],
  lesson_skipped: ['lesson_id', 'skill_id', 'source', 'seconds_open'],
  suggestion_shown: ['drill_id', 'reason', 'source'],
  suggestion_started: ['drill_id', 'reason', 'source'],
  drill_catalog_viewed: [],
  weekly_summary_viewed: ['week'],
  // D5: Repair drills and Defend.
  defend_submitted: ['attempt_id', 'type', 'decision', 'score'],
  // Not in the PRD table: a Repair set had to reuse items seen in the last 14 days.
  repair_pool_exhausted: ['drill_id', 'available'],
} as const satisfies Record<string, readonly string[]>;

// Logged by code but not (yet) in the PRD table.
export const EVENTS_NOT_IN_PRD = ['repair_pool_exhausted'] as const;

export type DrillEvent = keyof typeof DRILL_EVENT_PROPS;
export type EventProps<E extends DrillEvent> = { [K in (typeof DRILL_EVENT_PROPS)[E][number]]: unknown } & Record<string, unknown>;
// An event built now and logged later (after a transaction commits).
export type PendingEvent = { [E in DrillEvent]: { type: E; props: EventProps<E> } }[DrillEvent];
