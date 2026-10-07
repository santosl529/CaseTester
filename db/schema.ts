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
export const drillSetSourceEnum = pgEnum('drill_set_source', ['prescription', 'continue', 'specific', 'review', 'diagnostic']);
export const drillSetStatusEnum = pgEnum('drill_set_status', ['in_progress', 'grading', 'completed', 'expired']);
export const attemptGradingStatusEnum = pgEnum('attempt_grading_status', ['not_needed', 'pending', 'graded', 'delayed', 'failed']);
export const gradingJobStatusEnum = pgEnum('grading_job_status', ['queued', 'running', 'succeeded', 'failed']);
export const skillStateEnum = pgEnum('skill_state', ['not_started', 'learning', 'recognizes', 'mastered', 'validated']);
export const skillEventSourceEnum = pgEnum('skill_event_source', ['set', 'case', 'review']);
export const prescriptionSourceEnum = pgEnum('prescription_source', ['case', 'drill']);
export const prescriptionStatusEnum = pgEnum('prescription_status', ['open', 'in_progress', 'completed', 'dismissed', 'superseded']);

// The student record drills extends (PRD: "nullable org_id on the user
// record"). There is no app users table, so this is it. org_id is the club
// code accepted at /api/session, set once.
export const studentProfiles = pgTable('student_profiles', {
  userId: uuid('user_id').primaryKey(),
  orgId: text('org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const studentDrillSettings = pgTable('student_drill_settings', {
  studentId: uuid('student_id').primaryKey(),
  timeMultiplier: doublePrecision('time_multiplier').notNull().default(1),
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
  tier: integer('tier').notNull(),
  size: integer('size').notNull(),
  source: drillSetSourceEnum('source').notNull(),
  prescriptionId: uuid('prescription_id').references(() => prescriptions.id),
  focusTag: text('focus_tag'),
  status: drillSetStatusEnum('status').notNull().default('in_progress'),
  // Items are served strictly in order, so the timer for the item in play
  // lives on the set: served_at is set when position `currentPosition` is
  // fetched, and the submit checks it (PRD "Integrity rules").
  currentPosition: integer('current_position').notNull().default(0),
  currentServedAt: timestamp('current_served_at', { withTimezone: true }),
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
  gradingStatus: attemptGradingStatusEnum('grading_status').notNull().default('not_needed'),
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
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, t => [index('grading_jobs_status_idx').on(t.status, t.createdAt)]).enableRLS();

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
