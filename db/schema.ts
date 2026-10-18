import { sql } from 'drizzle-orm';
import {
  pgTable, text, uuid, integer, bigint, boolean, timestamp,
  jsonb, pgEnum, index, doublePrecision, date, primaryKey, uniqueIndex, check,
} from 'drizzle-orm/pg-core';

export const phaseEnum = pgEnum('phase', [
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'active', 'completed', 'abandoned', 'terminated',
]);

export const ratingEnum = pgEnum('rating', [
  'needs_work', 'meets_bar', 'strong',
]);

export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  firmStyle: text('firm_style').notNull(),
  difficulty: text('difficulty').notNull(),
  prompt: text('prompt').notNull(),
  contentJsonb: jsonb('content_jsonb').notNull(), // full server-side case data
  version: integer('version').notNull().default(1),
  active: boolean('active').notNull().default(true),
}).enableRLS();

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  caseId: text('case_id').notNull(),
  phase: phaseEnum('phase').notNull().default('INTRO'),
  elapsedMs: bigint('elapsed_ms', { mode: 'number' }).notNull().default(0),
  phaseStartedAt: timestamp('phase_started_at', { withTimezone: true }).notNull().defaultNow(),
  status: sessionStatusEnum('status').notNull().default('active'),
  abandonPhase: phaseEnum('abandon_phase'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  flagsJsonb: jsonb('flags_jsonb').notNull().default({
    stalled: false,
    ranLong: false,
    askedRepeat: false,
    offTopicCount: 0,
    pushbackDone: false,
    advancedLastTurn: false,
    timeWarningFired: false,
  }),
  // Live per-dimension coverage (0-100 evidence-sufficiency), updated by the
  // background coverage agent each turn. Steers the interviewer and gates
  // early end_case. Nullable — absent until the first background pass lands.
  coverageJsonb: jsonb('coverage_jsonb'),
}, t => [index('sessions_user_id_idx').on(t.userId)]).enableRLS();

export const sessionTurns = pgTable('session_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  turnIndex: integer('turn_index').notNull(),
  role: text('role').notNull(), // 'interviewer' | 'candidate'
  text: text('text').notNull(),
  timestampMs: bigint('timestamp_ms', { mode: 'number' }).notNull(),
  latencyMs: bigint('latency_ms', { mode: 'number' }),
}, t => [index('turns_session_idx').on(t.sessionId)]).enableRLS();

export const revealedData = pgTable('revealed_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  ledgerItemId: text('ledger_item_id').notNull(),
  revealedAtMs: bigint('revealed_at_ms', { mode: 'number' }).notNull(),
}, t => [index('revealed_session_idx').on(t.sessionId)]).enableRLS();

export const exhibitsShown = pgTable('exhibits_shown', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  exhibitId: text('exhibit_id').notNull(),
  shownAtMs: bigint('shown_at_ms', { mode: 'number' }).notNull(),
}).enableRLS();

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  structureRating: ratingEnum('structure_rating'),
  structureEvidence: jsonb('structure_evidence'),
  quantitativeRating: ratingEnum('quantitative_rating'),
  quantitativeEvidence: jsonb('quantitative_evidence'),
  dataExhibitRating: ratingEnum('data_exhibit_rating'),
  dataExhibitEvidence: jsonb('data_exhibit_evidence'),
  judgmentRating: ratingEnum('judgment_rating'),
  judgmentEvidence: jsonb('judgment_evidence'),
  creativityRating: ratingEnum('creativity_rating'),
  creativityEvidence: jsonb('creativity_evidence'),
  communicationRating: ratingEnum('communication_rating'),
  communicationEvidence: jsonb('communication_evidence'),
  synthesisRating: ratingEnum('synthesis_rating'),
  synthesisEvidence: jsonb('synthesis_evidence'),
  pushbackRating: ratingEnum('pushback_rating'),
  pushbackEvidence: jsonb('pushback_evidence'),
  overallRating: ratingEnum('overall_rating'),
  // Full structured judge output (RubricScores): per-dimension wentWell /
  // needsWork / missedOpportunities. Per-dimension *_evidence columns are
  // legacy (pre-July-2026 sessions) — new rows store rich feedback here.
  rubricJsonb: jsonb('rubric_jsonb'),
  topFix: text('top_fix'),
  deterministicJsonb: jsonb('deterministic_jsonb'),
  modelAnswerJsonb: jsonb('model_answer_jsonb'),
  scoringRuntimeMs: bigint('scoring_runtime_ms', { mode: 'number' }),
  judgeModel: text('judge_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Session event log (docs/interviewer-behavior.md Part III/IV, docs/scoring-qa.md).
// Two categories share one table with a discriminator:
//   - 'intervention': stall-ladder assists (Rule 13). A scoring input —
//     "assisted ≠ covered": an assisted candidate must not score like an
//     independent one. Queried at scoring time.
//   - 'conduct': C1–C5 conduct events (Rule 17). Internal-only, sensitive
//     (Rule 18: no partner-facing conduct data by default — FERPA). NEVER
//     surface conduct rows to the client/report; filter by category.
// Keeping them in one table minimizes migrations; the category discriminator
// plus the helper queries (never SELECT across categories) keeps the streams
// from crossing.
export const sessionEvents = pgTable('session_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  category: text('category').notNull(),   // 'intervention' | 'conduct' | 'data_request' | 'check'
  subtype: text('subtype').notNull(),     // e.g. 'restate_anchor', 'C2', 'C5'
  turnIndex: integer('turn_index'),
  phase: phaseEnum('phase'),
  payloadJsonb: jsonb('payload_jsonb'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('session_events_session_idx').on(t.sessionId)]).enableRLS();

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  userId: uuid('user_id'),
  eventType: text('event_type').notNull(),
  payloadJsonb: jsonb('payload_jsonb'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// ---------------------------------------------------------------------------
// Drills (docs/prd-drills.md "Data model"). A parallel workstream; nothing in
// the case-interview tables above references these. Like the tables above,
// RLS is on with no policies: all access goes through the server (db/client.ts).
// Tag and skill ids are text validated against lib/drills/config.ts, and every
// table carries taxonomy_version or references a row that does.
// ---------------------------------------------------------------------------

export const itemStatusEnum = pgEnum('drill_item_status', ['draft', 'in_review', 'live', 'retired']);
export const drillSetSourceEnum = pgEnum('drill_set_source', ['prescription', 'continue', 'specific', 'review', 'diagnostic', 'plan']);
export const drillSetStatusEnum = pgEnum('drill_set_status', ['in_progress', 'grading', 'completed', 'expired']);
export const attemptGradingStatusEnum = pgEnum('attempt_grading_status', ['not_needed', 'pending', 'graded', 'delayed', 'failed']);
export const gradingJobStatusEnum = pgEnum('grading_job_status', ['queued', 'running', 'succeeded', 'failed']);
export const skillStateEnum = pgEnum('skill_state', ['not_started', 'learning', 'recognizes', 'practiced', 'mastered', 'validated']);
export const skillEventSourceEnum = pgEnum('skill_event_source', ['set', 'case', 'review']);
export const prescriptionSourceEnum = pgEnum('prescription_source', ['case', 'drill', 'diagnostic', 'plan', 'questionnaire']);
export const prescriptionStatusEnum = pgEnum('prescription_status', ['open', 'in_progress', 'completed', 'dismissed', 'superseded', 'paused']);

// The student record drills extends (PRD: "nullable org_id on the user
// record"). There is no app users table, so this is it. org_id is the club
// code accepted at /api/session, set once.
export const studentProfiles = pgTable('student_profiles', {
  userId: uuid('user_id').primaryKey(),
  orgId: text('org_id'),
  // The browser's IANA time zone, stored at signup (D4): workout days, the
  // Monday summary and interview-date counts use it.
  timezone: text('timezone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const studentDrillSettings = pgTable('student_drill_settings', {
  studentId: uuid('student_id').primaryKey(),
  timeMultiplier: doublePrecision('time_multiplier').notNull().default(1),
  // "No time limit" (D6, WCAG 2.2.1): no timer, nothing times out. The
  // multiplier still sizes workout estimates.
  untimed: boolean('untimed').notNull().default(false),
  // "Hide timer" (D6 round 2): the student's last choice, the default for new sets.
  hideTimer: boolean('hide_timer').notNull().default(false),
  interviewDate: date('interview_date'),
  skippedExamples: text('skipped_examples').array().notNull().default(sql`'{}'::text[]`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [check('time_multiplier_allowed', sql`${t.timeMultiplier} in (1, 1.5, 2)`)]).enableRLS();

// Authored items only; generated items are rebuilt from template + seed.
export const drillItems = pgTable('drill_items', {
  itemId: text('item_id').notNull(),
  version: integer('version').notNull(),
  drillId: text('drill_id').notNull(),
  status: itemStatusEnum('status').notNull().default('draft'),
  // The drill's worked example (intro screen); never served in a set.
  isExample: boolean('is_example').notNull().default(false),
  stage: text('stage'),                       // recognize | repair | construct
  industry: text('industry'),                 // for transfer checks and the unfamiliar slot
  tier: integer('tier').notNull(),
  skills: text('skills').array().notNull(),
  payload: jsonb('payload').notNull(),        // full item incl. answer key — server-only
  authorship: jsonb('authorship').notNull(),
  taxonomyVersion: text('taxonomy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.itemId, t.version] }),
  index('drill_items_drill_status_idx').on(t.drillId, t.status),
]).enableRLS();

export const drillItemStats = pgTable('drill_item_stats', {
  itemId: text('item_id').notNull(),
  version: integer('version').notNull(),
  attempts: integer('attempts').notNull().default(0),
  correctRate: doublePrecision('correct_rate'),
  avgTimeMs: integer('avg_time_ms'),
  optionCounts: jsonb('option_counts'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.itemId, t.version] })]).enableRLS();

export const prescriptions = pgTable('prescriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  skillId: text('skill_id').notNull(),
  drillId: text('drill_id').notNull(),
  level: integer('level').notNull(),
  // recognize | repair | construct (PRD "Drill chains").
  stage: text('stage'),
  tier: integer('tier').notNull(),
  focusTag: text('focus_tag'),
  priority: doublePrecision('priority').notNull(),
  reasonText: text('reason_text').notNull(),
  evidenceQuote: text('evidence_quote'),
  sourceType: prescriptionSourceEnum('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  status: prescriptionStatusEnum('status').notNull().default('open'),
  taxonomyVersion: text('taxonomy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, t => [index('prescriptions_student_status_idx').on(t.studentId, t.status)]).enableRLS();

export const drillSets = pgTable('drill_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  drillId: text('drill_id').notNull(),
  level: integer('level').notNull(),
  stage: text('stage'),                       // recognize | repair | construct
  tier: integer('tier').notNull(),
  size: integer('size').notNull(),
  // The student's "No time limit" setting when the set started, fixed once
  // the first item is served.
  untimed: boolean('untimed').notNull().default(false),
  // The countdown is hidden (the limit still applies); the student can show
  // or hide it at any time.
  timerHidden: boolean('timer_hidden').notNull().default(false),
  // The clock is paused while Report a problem or the feedback box is open:
  // paused_at while paused; paused_ms totals the set's pauses (for reports).
  pausedAt: timestamp('paused_at', { withTimezone: true }),
  pausedMs: integer('paused_ms').notNull().default(0),
  // A short check of a questionnaire placement; its score re-places the skill.
  isPlacementCheck: boolean('is_placement_check').notNull().default(false),
  source: drillSetSourceEnum('source').notNull(),
  // A transfer check (PRD "Transfer check"): unseen items, new case types.
  isTransferCheck: boolean('is_transfer_check').notNull().default(false),
  // The workout this set belongs to, and its slot (D4 "Workouts").
  workoutId: uuid('workout_id'),
  slot: text('slot'),                         // weak | review | unfamiliar
  prescriptionId: uuid('prescription_id').references(() => prescriptions.id),
  // The skill the student picked (Practice something specific), which sets
  // the 70/30 composition on multi-skill drills, and a mistake-tag focus.
  focusSkill: text('focus_skill'),
  focusTag: text('focus_tag'),
  // The items, fixed at start: [{ kind: 'generated', template_id,
  // template_version, seed } | { kind: 'authored', item_id, version }].
  itemPlan: jsonb('item_plan').notNull().default([]),
  status: drillSetStatusEnum('status').notNull().default('in_progress'),
  // Items are served strictly in order, so the timer for the item in play
  // lives on the set: served_at is set when position `currentPosition` is
  // fetched, and the submit checks it (PRD "Integrity rules").
  currentPosition: integer('current_position').notNull().default(0),
  currentServedAt: timestamp('current_served_at', { withTimezone: true }),
  // A multi-step item's finished steps (QN-4 step 1), held server-side so the
  // answer can't change after the correct formula is shown.
  pendingStep: jsonb('pending_step'),
  setScore: doublePrecision('set_score'),
  passed: boolean('passed'),
  skillScores: jsonb('skill_scores'),
  taxonomyVersion: text('taxonomy_version').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [
  index('drill_sets_student_idx').on(t.studentId, t.startedAt),
  // "Each student can have one set in progress at a time."
  uniqueIndex('drill_sets_one_in_progress').on(t.studentId).where(sql`${t.status} = 'in_progress'`),
]).enableRLS();

// One row per item answered, the record everything else is computed from.
// Never deleted (except with the student's account); AI-graded fields are
// filled in once when grading finishes.
export const drillAttempts = pgTable('drill_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => drillSets.id),
  studentId: uuid('student_id').notNull(),
  position: integer('position').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  itemId: text('item_id'),
  itemVersion: integer('item_version'),
  templateId: text('template_id'),
  templateVersion: integer('template_version'),
  seed: bigint('seed', { mode: 'number' }),
  response: jsonb('response'),
  servedAt: timestamp('served_at', { withTimezone: true }).notNull(),
  timeMs: integer('time_ms').notNull(),
  timeLimitMs: integer('time_limit_ms').notNull(),
  timedOut: boolean('timed_out').notNull().default(false),
  skipped: boolean('skipped').notNull().default(false),
  score: doublePrecision('score'),              // null until AI grading finishes
  stepScores: jsonb('step_scores'),
  mistakeTags: text('mistake_tags').array().notNull().default(sql`'{}'::text[]`),
  checkResults: jsonb('check_results'),         // [{ check_id, pass, evidence }]
  redFlags: text('red_flags').array().notNull().default(sql`'{}'::text[]`),
  // The Defend step (D5), part of the same row: the reply ({ decision, text }),
  // its time, its score as a share of the Defend part, and its checks.
  defendResponse: jsonb('defend_response'),
  defendTimeMs: integer('defend_time_ms'),
  defendScore: doublePrecision('defend_score'),
  defendCheckResults: jsonb('defend_check_results'),
  gradingStatus: attemptGradingStatusEnum('grading_status').notNull().default('not_needed'),
  // Why an answer ended 'failed' ("Grading delayed"; it counts toward nothing):
  // 'request_cap', 'refused' (for review), 'billing', 'over_word_limit',
  // 'error' or 'failed_runs'.
  gradingIssue: text('grading_issue'),
  graderPromptVersion: text('grader_prompt_version'),
  modelId: text('model_id'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex('drill_attempts_set_position').on(t.setId, t.position),
  uniqueIndex('drill_attempts_idempotency').on(t.setId, t.idempotencyKey),
  index('drill_attempts_student_idx').on(t.studentId, t.submittedAt),
  index('drill_attempts_item_idx').on(t.itemId, t.itemVersion),
  // An attempt points at an authored item or a generated one, never both.
  check('drill_attempts_item_ref', sql`(
    ${t.itemId} is not null and ${t.itemVersion} is not null
    and ${t.templateId} is null and ${t.templateVersion} is null and ${t.seed} is null
  ) or (
    ${t.itemId} is null and ${t.itemVersion} is null
    and ${t.templateId} is not null and ${t.templateVersion} is not null and ${t.seed} is not null
  )`),
]).enableRLS();

// One row per AI grading call; also the grading queue.
export const gradingJobs = pgTable('grading_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => drillSets.id),
  status: gradingJobStatusEnum('status').notNull().default('queued'),
  retries: integer('retries').notNull().default(0),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: doublePrecision('cost_usd'),
  latencyMs: integer('latency_ms'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // When the latest run claimed the job; a run older than a few minutes has died.
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [index('grading_jobs_status_idx').on(t.status, t.createdAt)]).enableRLS();

// Cost controls (PRD "Cost controls"): the requests each grading call of an
// answer has made, across retries, quote re-asks and every run of the job,
// so no call passes rules.grading_limits.requests_per_call. A request is
// reserved here before it is sent. call: 'main', 'family', 'followup' or
// 'followup_data'. Server-only.
export const drillGradingCalls = pgTable('drill_grading_calls', {
  attemptId: uuid('attempt_id').notNull().references(() => drillAttempts.id, { onDelete: 'cascade' }),
  call: text('call').notNull(),
  requests: integer('requests').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.attemptId, t.call] })]).enableRLS();

// One row per grading request, written after every request whatever its
// outcome ('ok', 'invalid_output', 'refused', 'billing', 'error'): the spend
// the daily circuit breaker and the reports' cost figures read. A 'billing'
// row (a spend-limit or billing error) also trips the breaker for the day.
// Server-only.
export const drillGradingSpend = pgTable('drill_grading_spend', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => drillSets.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => gradingJobs.id, { onDelete: 'cascade' }),
  attemptId: uuid('attempt_id').references(() => drillAttempts.id, { onDelete: 'cascade' }),
  call: text('call').notNull(),
  modelId: text('model_id').notNull(),
  outcome: text('outcome').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  costUsd: doublePrecision('cost_usd').notNull().default(0),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('drill_grading_spend_created_idx').on(t.createdAt), index('drill_grading_spend_set_idx').on(t.setId)]).enableRLS();

export const drillTiers = pgTable('drill_tiers', {
  studentId: uuid('student_id').notNull(),
  drillId: text('drill_id').notNull(),
  currentTier: integer('current_tier').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.studentId, t.drillId] })]).enableRLS();

export const skillStates = pgTable('skill_states', {
  studentId: uuid('student_id').notNull(),
  skillId: text('skill_id').notNull(),
  state: skillStateEnum('state').notNull().default('not_started'),
  l1PassingStreak: integer('l1_passing_streak').notNull().default(0),
  l2PassingStreak: integer('l2_passing_streak').notNull().default(0),
  lastSkillScore: doublePrecision('last_skill_score'),
  lastPracticedAt: timestamp('last_practiced_at', { withTimezone: true }),
  nextReviewAt: timestamp('next_review_at', { withTimezone: true }),
  // The progress engine's working state (lib/drills/progress/engine.ts).
  stage: text('stage'),                       // recognize | repair | construct; null until placed
  practicedAt: timestamp('practiced_at', { withTimezone: true }),
  transferDueAt: timestamp('transfer_due_at', { withTimezone: true }),
  lowStreak: integer('low_streak').notNull().default(0),       // consecutive sets below 50%
  repairSets: integer('repair_sets').notNull().default(0),     // Repair sets since entering Repair
  pausedForPrereq: text('paused_for_prereq'),                  // stuck rule: the prerequisite in play
  prereqSets: integer('prereq_sets').notNull().default(0),     // prerequisite sets since pausing
  nextFocusTag: text('next_focus_tag'),                        // "the next set focuses on that tag"
  taxonomyVersion: text('taxonomy_version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.studentId, t.skillId] })]).enableRLS();

// Append-only history of skill state changes.
export const skillStateEvents = pgTable('skill_state_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  skillId: text('skill_id').notNull(),
  fromState: skillStateEnum('from_state').notNull(),
  toState: skillStateEnum('to_state').notNull(),
  reason: text('reason').notNull(),
  sourceType: skillEventSourceEnum('source_type').notNull(),
  sourceId: text('source_id').notNull(),
  taxonomyVersion: text('taxonomy_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('skill_state_events_student_idx').on(t.studentId, t.createdAt)]).enableRLS();

// Append-only; written from the case grader payload (lib/drills/case-result.ts).
// Ingestion is idempotent on case_attempt_id.
export const caseResults = pgTable('case_results', {
  caseAttemptId: text('case_attempt_id').primaryKey(),
  studentId: uuid('student_id').notNull(),
  caseId: text('case_id').notNull(),
  caseType: text('case_type'),
  difficultyTier: integer('difficulty_tier').notNull(),
  rubricScores: jsonb('rubric_scores').notNull(),
  skillsObserved: text('skills_observed').array().notNull(),
  findings: jsonb('findings').notNull(),
  taxonomyVersion: text('taxonomy_version').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('case_results_student_idx').on(t.studentId, t.completedAt)]).enableRLS();

// ---------------------------------------------------------------------------
// Drills D4: the training program (docs/prd-drills.md "Training program").
// ---------------------------------------------------------------------------

export const programTrackEnum = pgEnum('program_track', ['foundations', 'standard', 'sprint', 'self_directed']);
export const programStatusEnum = pgEnum('program_status', ['active', 'completed', 'switched']);
export const workoutStatusEnum = pgEnum('workout_status', ['planned', 'in_progress', 'completed', 'expired']);

// One active row per student; a track switch closes the row and opens a new one.
export const studentPrograms = pgTable('student_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  track: programTrackEnum('track').notNull(),
  planVersion: text('plan_version').notNull(),
  // Day 1 of the plan, in the student's time zone.
  startDate: date('start_date').notNull(),
  interviewDate: date('interview_date'),
  workoutsPerWeek: integer('workouts_per_week'),
  // Onboarding answer: '0', '1-5' or '6+'.
  casesDone: text('cases_done'),
  // What the plan was built from (D6 round 2): case > diagnostic >
  // questionnaire. Null until the first one arrives; workouts start then.
  planSource: text('plan_source'),
  planCreatedAt: timestamp('plan_created_at', { withTimezone: true }),
  planSeenAt: timestamp('plan_seen_at', { withTimezone: true }),
  // The plan week the student was last seen in, for the week-rollover event.
  currentWeek: integer('current_week').notNull().default(0),
  status: programStatusEnum('status').notNull().default('active'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, t => [
  index('student_programs_student_idx').on(t.studentId, t.startedAt),
  uniqueIndex('student_programs_one_active').on(t.studentId).where(sql`${t.status} = 'active'`),
]).enableRLS();

// One per student per day (the student's local date).
export const workouts = pgTable('workouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  programId: uuid('program_id').references(() => studentPrograms.id),
  programWeek: integer('program_week'),
  date: date('date').notNull(),
  targetMinutes: integer('target_minutes').notNull(),
  // [{ slot, drill_id, skill_id, stage, tier, kind, reason, minutes, set_id }]
  blocks: jsonb('blocks').notNull().default([]),
  status: workoutStatusEnum('status').notNull().default('planned'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [uniqueIndex('workouts_student_date').on(t.studentId, t.date)]).enableRLS();

// Versioned like items (PRD "Lessons").
export const lessons = pgTable('lessons', {
  lessonId: text('lesson_id').notNull(),
  version: integer('version').notNull(),
  skillId: text('skill_id').notNull(),
  status: itemStatusEnum('status').notNull().default('draft'),
  body: text('body').notNull(),
  workedExample: text('worked_example').notNull(),
  mistakes: jsonb('mistakes').notNull(),       // [{ tag, line }]
  authorship: jsonb('authorship').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.lessonId, t.version] }), index('lessons_skill_idx').on(t.skillId, t.status)]).enableRLS();

export const lessonViews = pgTable('lesson_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  lessonId: text('lesson_id').notNull(),
  version: integer('version').notNull(),
  source: text('source').notNull(),            // auto | intro | library | low_score | follow_up
  secondsOpen: integer('seconds_open'),
  skipped: boolean('skipped').notNull().default(false),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('lesson_views_student_idx').on(t.studentId, t.viewedAt)]).enableRLS();

export const diagnosticStatusEnum = pgEnum('diagnostic_status', ['in_progress', 'completed', 'skipped']);

// The diagnostic (PRD "Onboarding and diagnostic"): one short set per part,
// run back to back. Placement is recomputed as parts finish, so a student
// who stops partway is placed from what they finished.
export const diagnostics = pgTable('diagnostics', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  // [{ drill_id, size, set_id }]
  parts: jsonb('parts').notNull(),
  status: diagnosticStatusEnum('status').notNull().default('in_progress'),
  overallScore: doublePrecision('overall_score'),
  // { skill_id: { score, count, place } }
  placements: jsonb('placements'),
  // The track the diagnostic moved the student to (Standard → Foundations).
  movedToTrack: programTrackEnum('moved_to_track'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [
  index('diagnostics_student_idx').on(t.studentId, t.startedAt),
  uniqueIndex('diagnostics_one_in_progress').on(t.studentId).where(sql`${t.status} = 'in_progress'`),
]).enableRLS();


// ---------------------------------------------------------------------------
// D6 pilot feedback (docs/prd-drills.md "Pilot feedback"): the feedback
// button, "Report a problem" on items and results (grade disputes included),
// and check-ins. Students' text, never sent to a model.

export const feedbackCategoryEnum = pgEnum('drill_feedback_category', ['broken', 'confusing', 'idea']);
export const reportReasonEnum = pgEnum('drill_report_reason', ['answer_key_wrong', 'question_confusing', 'grade_unfair', 'other']);
export const reportStatusEnum = pgEnum('drill_report_status', ['open', 'labeled', 'resolved', 'dismissed']);
export const checkinKindEnum = pgEnum('drill_checkin_kind', ['set_usefulness', 'first_case', 'week_1']);
export const checkinStatusEnum = pgEnum('drill_checkin_status', ['shown', 'answered', 'dismissed']);

// The feedback button on every drills page. The page, set and item in play,
// device and app version are attached automatically.
export const drillFeedback = pgTable('drill_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  category: feedbackCategoryEnum('category').notNull(),
  comment: text('comment'),
  page: text('page').notNull(),
  setId: uuid('set_id').references(() => drillSets.id),
  position: integer('position'),
  itemId: text('item_id'),
  itemVersion: integer('item_version'),
  templateId: text('template_id'),
  device: text('device'),
  appVersion: text('app_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('drill_feedback_created_idx').on(t.createdAt)]).enableRLS();

// "Report a problem" on an item or results screen. A report on an answered
// item links its attempt; Matt labels disputed AI grades check by check
// (labels, red_flags) and exports them to the golden sets.
export const drillItemReports = pgTable('drill_item_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  setId: uuid('set_id').notNull().references(() => drillSets.id),
  position: integer('position').notNull(),
  attemptId: uuid('attempt_id').references(() => drillAttempts.id),
  itemId: text('item_id'),
  itemVersion: integer('item_version'),
  templateId: text('template_id'),
  screen: text('screen').notNull(),             // item | results
  reason: reportReasonEnum('reason').notNull(),
  comment: text('comment'),
  status: reportStatusEnum('status').notNull().default('open'),
  labels: jsonb('labels'),                      // check_id → passes (Matt's labels)
  redFlags: jsonb('red_flags'),                 // red flag id → present
  reviewerNotes: text('reviewer_notes'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  exportedAt: timestamp('exported_at', { withTimezone: true }),   // written to /drill-golden
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('drill_item_reports_status_idx').on(t.status, t.createdAt)]).enableRLS();

// Check-ins: "How useful was today's practice?" after a completed set (at
// most once a week), and one open question after the first full case and at
// the end of week 1. A row is written when shown; dismissing is allowed.
export const drillCheckins = pgTable('drill_checkins', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  kind: checkinKindEnum('kind').notNull(),
  setId: uuid('set_id').references(() => drillSets.id),
  rating: integer('rating'),
  comment: text('comment'),
  status: checkinStatusEnum('status').notNull().default('shown'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp('answered_at', { withTimezone: true }),
}, t => [
  index('drill_checkins_student_idx').on(t.studentId, t.createdAt),
  // The open questions are asked once each.
  uniqueIndex('drill_checkins_once').on(t.studentId, t.kind).where(sql`${t.kind} <> 'set_usefulness'`),
  // One usefulness check-in per set (the results page refreshes while grading).
  uniqueIndex('drill_checkins_per_set').on(t.studentId, t.setId).where(sql`${t.kind} = 'set_usefulness'`),
  check('drill_checkins_rating', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
]).enableRLS();

// The 2–3 minute questionnaire (D6 round 2): self-ratings 1–5 and the area the
// student finds hardest. The latest one counts; the least reliable plan source.
export const drillQuestionnaires = pgTable('drill_questionnaires', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull(),
  ratings: jsonb('ratings').notNull(),          // { structuring, math, charts, recommendations }: 1–5
  hardest: text('hardest'),                     // one of those areas, or null ("not sure")
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('drill_questionnaires_student_idx').on(t.studentId, t.createdAt)]).enableRLS();

// The monthly Cartesia character ledger (voice deploy, 18 Oct): one row per
// calendar month (UTC, 'YYYY-MM'), shared by every agent job on every worker
// and the local voice scripts. Incremented in one statement
// (lib/voice/tts-ledger-store.ts), so concurrent jobs share one cap.
// Server-only: RLS on, no policies.
export const voiceTtsUsage = pgTable('voice_tts_usage', {
  month: text('month').primaryKey(),
  used: integer('used').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// A voice session's per-turn records (lib/voice/records.ts), one row per line
// the agent used to append to Case Interview Runs/voice-live/<date>/<id>.jsonl:
// turn records, client timing lines, the closing summary. In insert order;
// scripts/voice-export.ts writes them back out as that file. Server-only.
export const voiceSessionLines = pgTable('voice_session_lines', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  line: jsonb('line').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('voice_session_lines_session_idx').on(t.sessionId)]).enableRLS();
