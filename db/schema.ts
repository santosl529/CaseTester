import {
  pgTable, text, uuid, integer, bigint, boolean, timestamp,
  jsonb, pgEnum, index,
} from 'drizzle-orm/pg-core';

export const phaseEnum = pgEnum('phase', [
  'INTRO', 'CLARIFY', 'STRUCTURE', 'ANALYSIS',
  'EXHIBIT', 'BRAINSTORM', 'RECOMMENDATION', 'WRAP', 'SCORING',
]);

export const sessionStatusEnum = pgEnum('session_status', [
  'active', 'completed', 'abandoned',
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
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  caseId: text('case_id').notNull().references(() => cases.id),
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
  }),
}, t => [index('sessions_user_id_idx').on(t.userId)]);

export const sessionTurns = pgTable('session_turns', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  turnIndex: integer('turn_index').notNull(),
  role: text('role').notNull(), // 'interviewer' | 'candidate'
  text: text('text').notNull(),
  timestampMs: bigint('timestamp_ms', { mode: 'number' }).notNull(),
  latencyMs: bigint('latency_ms', { mode: 'number' }),
}, t => [index('turns_session_idx').on(t.sessionId)]);

export const revealedData = pgTable('revealed_data', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  ledgerItemId: text('ledger_item_id').notNull(),
  revealedAtMs: bigint('revealed_at_ms', { mode: 'number' }).notNull(),
}, t => [index('revealed_session_idx').on(t.sessionId)]);

export const exhibitsShown = pgTable('exhibits_shown', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  exhibitId: text('exhibit_id').notNull(),
  shownAtMs: bigint('shown_at_ms', { mode: 'number' }).notNull(),
});

export const scores = pgTable('scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  structureRating: ratingEnum('structure_rating'),
  structureEvidence: jsonb('structure_evidence'),
  quantitativeRating: ratingEnum('quantitative_rating'),
  quantitativeEvidence: jsonb('quantitative_evidence'),
  judgmentRating: ratingEnum('judgment_rating'),
  judgmentEvidence: jsonb('judgment_evidence'),
  communicationRating: ratingEnum('communication_rating'),
  communicationEvidence: jsonb('communication_evidence'),
  synthesisRating: ratingEnum('synthesis_rating'),
  synthesisEvidence: jsonb('synthesis_evidence'),
  overallRating: ratingEnum('overall_rating'),
  topFix: text('top_fix'),
  deterministicJsonb: jsonb('deterministic_jsonb'),
  modelAnswerJsonb: jsonb('model_answer_jsonb'),
  scoringRuntimeMs: bigint('scoring_runtime_ms', { mode: 'number' }),
  judgeModel: text('judge_model'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const analyticsEvents = pgTable('analytics_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => sessions.id),
  userId: uuid('user_id'),
  eventType: text('event_type').notNull(),
  payloadJsonb: jsonb('payload_jsonb'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
