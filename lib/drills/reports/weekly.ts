// The pilot dashboard (Matt, 22 Nov 2026): one weekly page for the founders. Pure: every number from rows the loader
// (weekly-load.ts) reads, so each definition is tested (tests/drills/pilot-dashboard.test.ts). Weeks run Monday to
// Sunday in US Eastern; a practice day is the student's own calendar day. Every rate carries its count.
const DAY = 86_400_000;
const ET = 'America/New_York';

// ------------------------------------------------------------------ weeks and days

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { f = new Intl.DateTimeFormat('en-CA', { timeZone: ET }); }
    formatters.set(tz, f);
  }
  return f;
}
// A calendar day, YYYY-MM-DD, in a time zone (US Eastern by default, or when the zone is unknown).
export const dayIn = (d: Date, tz: string | null = ET) => fmt(tz || ET).format(d);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// The Monday (US Eastern) of the week holding `d`, as YYYY-MM-DD.
export function weekKey(d: Date): string {
  const [y, m, dd] = dayIn(d).split('-').map(Number);
  const u = Date.UTC(y, m - 1, dd);
  return isoDay(u - ((new Date(u).getUTCDay() + 6) % 7) * DAY);
}
export const addWeeks = (key: string, n: number) => isoDay(Date.parse(`${key}T00:00:00Z`) + n * 7 * DAY);
export function weekKeys(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let k = weekKey(from), end = weekKey(to); k <= end; k = addWeeks(k, 1)) out.push(k);
  return out;
}
// The week the tiles show: the last full week in the range (the current week isn't over yet).
export function focusWeek(weeks: string[], now: Date): string | null {
  const current = weekKey(now);
  return [...weeks].reverse().find(w => w < current) ?? null;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const weekName = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}`;

// ------------------------------------------------------------------ inputs

export interface WStudent { id: string; org: string | null; signedUpAt: Date; tz: string | null }
export interface WSet { studentId: string; startedAt: Date; completedAt: Date | null; skills: string[] }
export interface WCase { id: string; userId: string; startedAt: Date; completedAt: Date | null; status: string }
export interface WResult {
  id: string; studentId: string; tier: number; completedAt: Date; retake: boolean; partial: boolean;
  rubric: Record<string, string>; flagged: string[];
}
export interface WEvent { type: string; userId: string | null; sessionId: string | null; at: Date; payload: Record<string, unknown> }

export interface WeeklyInput {
  now: Date;
  weeks: string[];
  students: WStudent[];
  // First plan, and first choice of a starting point (a plan, a quiz part, the questions or a case started).
  planAt: Record<string, Date>;
  choseAt: Record<string, Date>;
  sets: WSet[];
  cases: WCase[];
  results: WResult[];
  skillMoves: { studentId: string; to: string; at: Date }[];
  // The students' own events (report_viewed, post_case_rating, next steps, case_limit_hit, voice, logged_in, page_view).
  events: WEvent[];
  // Logged-out page views (no student): only with every club.
  anonymousViews: WEvent[];
  // Visitor codes the students had when they signed up (signed_up).
  signUpVisitors: { visitor: string; at: Date }[];
  wrongCodes: Date[];
  costs: { drills: { studentId: string; usd: number; at: Date }[]; cases: { studentId: string; usd: number; at: Date }[] };
  graded: Date[];
  disputes: Date[];
  stuck: Date[];
  comments: { at: Date; text: string; where: string }[];
  // Sentry error events per week (every user), or null when Sentry couldn't be read.
  sentry: Record<string, number> | null;
}

// ------------------------------------------------------------------ helpers

export interface Ratio { n: number; of: number; value: number | null }
const ratio = (n: number, of: number): Ratio => ({ n, of, value: of > 0 ? n / of : null });
const RANK: Record<string, number> = { needs_work: 0, meets_bar: 1, strong: 2 };
const plus = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

// The dimension a skill is rated under (its area), for "dimension improved".
const AREA_DIMENSION: Record<string, string> = {
  PS: 'structure', HY: 'structure', QN: 'quantitative', EX: 'dataExhibit', SY: 'synthesis', CL: 'pushback',
  CR: 'creativity', BJ: 'judgment', CM: 'communication',
};
export const dimensionOf = (skill: string) => AREA_DIMENSION[skill.split('.')[0]] ?? null;

function activity(input: WeeklyInput) {
  const tz = new Map(input.students.map(s => [s.id, s.tz]));
  const byStudent = new Map<string, Date[]>();
  const add = (id: string, at: Date) => byStudent.set(id, [...(byStudent.get(id) ?? []), at]);
  for (const s of input.sets) if (s.completedAt) add(s.studentId, s.completedAt);
  for (const c of input.cases) add(c.userId, c.startedAt);
  // Practice days in a week: the student's own calendar days with a finished set or a case started.
  const daysIn = (id: string, week: string) => new Set((byStudent.get(id) ?? []).filter(a => weekKey(a) === week).map(a => dayIn(a, tz.get(id) ?? null)));
  const activeBetween = (id: string, from: Date, to: Date) => (byStudent.get(id) ?? []).some(a => a >= from && a < to);
  const activeIn = (week: string) => input.students.filter(s => daysIn(s.id, week).size > 0);
  return { byStudent, daysIn, activeBetween, activeIn, tz };
}

// The next case at the same level after `a`, that is neither a retake nor ended early.
function nextSameLevel(results: WResult[], a: WResult): WResult | null {
  return results.filter(b => b.studentId === a.studentId && b.tier === a.tier && !b.retake && !b.partial && b.completedAt > a.completedAt)
    .sort((x, y) => x.completedAt.getTime() - y.completedAt.getTime())[0] ?? null;
}
const practicedBetween = (sets: WSet[], studentId: string, skill: string, from: Date, to: Date) =>
  sets.some(s => s.studentId === studentId && s.completedAt && s.completedAt > from && s.completedAt < to && s.skills.includes(skill));

// ------------------------------------------------------------------ the five tiles

export const TARGETS = { start: 0.5, comeBack: 0.3, use: 2, improve: 0.5, value: 4 } as const;
export type Status = 'green' | 'amber' | 'red' | 'none';
// Green at or above target, amber from 80% of it, red below.
export const statusOf = (value: number | null, target: number): Status =>
  value === null ? 'none' : value >= target ? 'green' : value >= target * 0.8 ? 'amber' : 'red';

export function tilesFor(input: WeeklyInput, week: string) {
  const a = activity(input);
  const firstSet = new Map<string, Date>();
  for (const s of input.sets) if (s.completedAt && (!firstSet.has(s.studentId) || s.completedAt < firstSet.get(s.studentId)!)) firstSet.set(s.studentId, s.completedAt);
  const firstCase = new Map<string, Date>();
  for (const c of input.cases) if (c.status === 'completed' && c.completedAt && (!firstCase.has(c.userId) || c.completedAt < firstCase.get(c.userId)!)) firstCase.set(c.userId, c.completedAt);

  // Start: students whose first 7 days ended this week; a plan, plus a drill set or a full case, within them.
  const startCohort = input.students.filter(s => weekKey(plus(s.signedUpAt, 7)) === week);
  const within7 = (s: WStudent, d: Date | undefined) => Boolean(d && d.getTime() - s.signedUpAt.getTime() <= 7 * DAY);
  const activated = startCohort.filter(s => within7(s, input.planAt[s.id]) && (within7(s, firstSet.get(s.id)) || within7(s, firstCase.get(s.id))));
  const firstCaseIn7 = startCohort.filter(s => within7(s, firstCase.get(s.id)));

  // Come back: students whose week 4 (days 22–28) ended this week; active in it.
  const backCohort = input.students.filter(s => weekKey(plus(s.signedUpAt, 28)) === week);
  const back = backCohort.filter(s => a.activeBetween(s.id, plus(s.signedUpAt, 21), plus(s.signedUpAt, 28)));

  // Use: practice days per active student; cases per active student.
  const active = a.activeIn(week);
  const days = active.reduce((n, s) => n + a.daysIn(s.id, week).size, 0);
  const casesStarted = input.cases.filter(c => weekKey(c.startedAt) === week && active.some(s => s.id === c.userId)).length;

  // Improve: skills a report flagged that the student then practiced, judged by their next case at the same level
  // finished this week: improved when that case didn't flag the skill again.
  let improveOf = 0, improved = 0;
  for (const r of input.results) {
    if (r.partial) continue;
    const next = nextSameLevel(input.results, r);
    if (!next || weekKey(next.completedAt) !== week) continue;
    for (const skill of new Set(r.flagged)) {
      if (!practicedBetween(input.sets, r.studentId, skill, r.completedAt, next.completedAt)) continue;
      improveOf++;
      if (!next.flagged.includes(skill)) improved++;
    }
  }

  // Value: "how useful" (1–5), with realism beside it.
  const ratings = input.events.filter(e => e.type === 'post_case_rating' && weekKey(e.at) === week);
  const avg = (k: string) => ratings.length ? ratings.reduce((n, e) => n + Number(e.payload[k] ?? 0), 0) / ratings.length : null;

  return {
    start: { ...ratio(activated.length, startCohort.length), firstCase: ratio(firstCaseIn7.length, startCohort.length) },
    comeBack: ratio(back.length, backCohort.length),
    use: { value: active.length ? days / active.length : null, students: active.length, casesPerStudent: active.length ? casesStarted / active.length : null, cases: casesStarted },
    improve: ratio(improved, improveOf),
    value: { value: avg('usefulness'), realism: avg('realism'), n: ratings.length },
  };
}

export type Tiles = ReturnType<typeof tilesFor>;

// ------------------------------------------------------------------ the page

export function weeklyDashboard(input: WeeklyInput) {
  const { weeks, now } = input;
  const focus = focusWeek(weeks, now);
  const a = activity(input);
  const tiles = focus ? tilesFor(input, focus) : null;
  const prev = focus ? tilesFor(input, addWeeks(focus, -1)) : null;
  const inRange = (d: Date) => weeks.length > 0 && weekKey(d) >= weeks[0] && weekKey(d) <= weeks[weeks.length - 1];
  const ev = (type: string) => input.events.filter(e => e.type === type);

  // Funnel: students who signed up in the range.
  const cohort = input.students.filter(s => inRange(s.signedUpAt));
  const has = (pred: (s: WStudent) => boolean) => ratio(cohort.filter(pred).length, cohort.length);
  const viewed = new Set(ev('report_viewed').map(e => e.userId));
  const otherDay = (s: WStudent) => {
    const signUpDay = dayIn(s.signedUpAt, s.tz);
    const ats = [...(a.byStudent.get(s.id) ?? []), ...input.events.filter(e => e.userId === s.id && (e.type === 'logged_in' || e.type === 'page_view')).map(e => e.at)];
    return ats.some(at => dayIn(at, s.tz) !== signUpDay);
  };
  const funnel = [
    { step: 'Signed up', ...ratio(cohort.length, cohort.length) },
    { step: 'Chose a starting point', ...has(s => Boolean(input.choseAt[s.id])) },
    { step: 'First drill set', ...has(s => input.sets.some(x => x.studentId === s.id && x.completedAt)) },
    { step: 'First full case', ...has(s => input.cases.some(c => c.userId === s.id && c.status === 'completed')) },
    { step: 'Read the report', ...has(s => viewed.has(s.id)) },
    { step: 'Came back another day', ...has(otherDay) },
  ];

  // Weekly cohorts: by sign-up week, active in weeks 1–4 after sign-up (null until the week is over).
  const cohorts = weeks.map(w => {
    const group = input.students.filter(s => weekKey(s.signedUpAt) === w);
    return {
      week: w, n: group.length,
      weeks: [1, 2, 3, 4].map(k => {
        if (group.length === 0) return null;
        if (group.some(s => plus(s.signedUpAt, 7 * k) > now)) return null;
        return ratio(group.filter(s => a.activeBetween(s.id, plus(s.signedUpAt, 7 * (k - 1)), plus(s.signedUpAt, 7 * k))).length, group.length);
      }),
    };
  });

  // Website traffic: page views, by page; logged-out visitors and logged-in students; sessions (30 minutes idle ends one).
  const signUpCodes = new Set(input.signUpVisitors.map(v => v.visitor));
  const traffic = weeks.map(w => {
    const views = [...ev('page_view'), ...input.anonymousViews].filter(e => weekKey(e.at) === w);
    const actor = (e: WEvent) => e.userId ?? `v:${String(e.payload.visitor ?? '')}`;
    const byActor = new Map<string, Date[]>();
    for (const e of views) byActor.set(actor(e), [...(byActor.get(actor(e)) ?? []), e.at]);
    const sessions: { pages: number; ms: number }[] = [];
    for (const ats of byActor.values()) {
      const sorted = ats.sort((x, y) => x.getTime() - y.getTime());
      let start = sorted[0], last = sorted[0], pages = 1;
      for (const at of sorted.slice(1)) {
        if (at.getTime() - last.getTime() >= 30 * 60_000) { sessions.push({ pages, ms: last.getTime() - start.getTime() }); start = at; pages = 0; }
        pages++; last = at;
      }
      if (sorted.length) sessions.push({ pages, ms: last.getTime() - start.getTime() });
    }
    const anon = new Set(views.filter(e => !e.userId).map(e => String(e.payload.visitor ?? '')));
    return {
      week: w, views: views.length,
      visitors: anon.size, visitorsWhoSignedUp: [...anon].filter(v => signUpCodes.has(v)).length,
      students: new Set(views.filter(e => e.userId).map(e => e.userId)).size,
      sessions: sessions.length,
      avgSessionMinutes: sessions.length ? sessions.reduce((n, s) => n + s.ms, 0) / sessions.length / 60_000 : null,
      pagesPerSession: sessions.length ? sessions.reduce((n, s) => n + s.pages, 0) / sessions.length : null,
    };
  });
  const pageCounts = new Map<string, number>();
  for (const e of [...ev('page_view'), ...input.anonymousViews].filter(e => focus && weekKey(e.at) === focus)) {
    const p = String(e.payload.path ?? '?');
    pageCounts.set(p, (pageCounts.get(p) ?? 0) + 1);
  }
  const topPages = [...pageCounts].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([path, views]) => ({ path, views }));

  // Learning: skills reaching Practiced, Mastered, Validated; case to case by dimension at the same level.
  const learning = weeks.map(w => {
    const moves = input.skillMoves.filter(m => weekKey(m.at) === w);
    const dims: Record<string, { up: number; same: number; down: number }> = {};
    for (const b of input.results.filter(r => weekKey(r.completedAt) === w && !r.retake && !r.partial)) {
      const prevCase = input.results.filter(x => x.studentId === b.studentId && x.tier === b.tier && !x.retake && !x.partial && x.completedAt < b.completedAt)
        .sort((x, y) => y.completedAt.getTime() - x.completedAt.getTime())[0];
      if (!prevCase) continue;
      for (const [dim, rating] of Object.entries(b.rubric)) {
        const before = prevCase.rubric[dim];
        if (before === undefined || RANK[rating] === undefined || RANK[before] === undefined) continue;
        const d = (dims[dim] ??= { up: 0, same: 0, down: 0 });
        if (RANK[rating] > RANK[before]) d.up++; else if (RANK[rating] < RANK[before]) d.down++; else d.same++;
      }
    }
    return {
      week: w,
      practiced: moves.filter(m => m.to === 'practiced').length,
      mastered: moves.filter(m => m.to === 'mastered').length,
      validated: moves.filter(m => m.to === 'validated').length,
      dimensions: dims,
    };
  });

  // Next steps: shown → clicked → practiced → the skill's dimension improved in the next case at the same level.
  const results = new Map(input.results.map(r => [r.id, r]));
  const nextSteps = weeks.map(w => {
    let shown = 0, clicked = 0, practiced = 0, judged = 0, improved = 0;
    for (const e of ev('next_steps_shown').filter(x => weekKey(x.at) === w)) {
      const caseId = String(e.payload.case_attempt_id ?? '');
      const skills = (e.payload.skill_ids as string[] | undefined) ?? [];
      for (const skill of skills) {
        shown++;
        const mine = (t: string) => ev(t).some(x => x.payload.case_attempt_id === caseId && x.payload.skill_id === skill);
        if (mine('next_step_clicked')) clicked++;
        if (!mine('next_step_completed')) continue;
        practiced++;
        const r = results.get(caseId);
        const next = r ? nextSameLevel(input.results, r) : null;
        const dim = dimensionOf(skill);
        if (!r || !next || !dim || r.rubric[dim] === undefined || next.rubric[dim] === undefined) continue;
        judged++;
        if (RANK[next.rubric[dim]] > RANK[r.rubric[dim]]) improved++;
      }
    }
    return { week: w, shown, clicked: ratio(clicked, shown), practiced: ratio(practiced, shown), improved: ratio(improved, judged) };
  });

  // Reliability.
  const reliability = weeks.map(w => {
    const started = input.cases.filter(c => weekKey(c.startedAt) === w);
    const voiceStarted = new Set(ev('voice_session_started').filter(e => weekKey(e.at) === w).map(e => e.sessionId));
    const failures = ev('voice_connect_failed').filter(e => weekKey(e.at) === w);
    const failedSessions = new Set(failures.map(e => e.sessionId));
    const kinds: Record<string, number> = {};
    for (const e of failures) kinds[String(e.payload.kind)] = (kinds[String(e.payload.kind)] ?? 0) + 1;
    const active = a.activeIn(w).length;
    const graded = input.graded.filter(d => weekKey(d) === w).length;
    const disputes = input.disputes.filter(d => weekKey(d) === w).length;
    return {
      week: w,
      cases: ratio(started.filter(c => c.status === 'completed').length, started.length),
      voiceFailed: { ...ratio(failedSessions.size, new Set([...voiceStarted, ...failedSessions]).size), kinds },
      errorsPerStudent: input.sentry && active ? (input.sentry[w] ?? 0) / active : null,
      errors: input.sentry ? input.sentry[w] ?? 0 : null,
      stuckGrading: input.stuck.filter(d => weekKey(d) === w).length,
      disputesPer100: { per100: graded ? (disputes / graded) * 100 : null, disputes, graded },
    };
  });

  // Cost: AI cost per active student per month, over the four weeks ending each week; drills against $1.25.
  const cost = weeks.map(w => {
    const span = [addWeeks(w, -3), addWeeks(w, -2), addWeeks(w, -1), w];
    const actives = new Set(span.flatMap(x => a.activeIn(x).map(s => s.id)));
    const sum = (rows: { usd: number; at: Date }[]) => rows.filter(r => span.includes(weekKey(r.at))).reduce((n, r) => n + r.usd, 0);
    const drills = sum(input.costs.drills), cases = sum(input.costs.cases);
    const per = (usd: number) => (actives.size ? (usd / actives.size) * (30 / 28) : null);
    return { week: w, students: actives.size, drills: per(drills), cases: per(cases), drillsTotal: drills, casesTotal: cases };
  });

  // Reach: sign-ups and active students by club; wrong club codes (every club: no account to filter by).
  const clubs = [...new Set(input.students.map(s => s.org ?? 'none'))].sort();
  const reach = {
    clubs: clubs.map(org => ({
      org,
      weeks: weeks.map(w => ({
        signUps: input.students.filter(s => (s.org ?? 'none') === org && weekKey(s.signedUpAt) === w).length,
        active: a.activeIn(w).filter(s => (s.org ?? 'none') === org).length,
      })),
    })),
    wrongCodes: weeks.map(w => input.wrongCodes.filter(d => weekKey(d) === w).length),
  };

  // Limits: of the students who started a case or hit a limit, the share who hit the daily or the monthly limit.
  const limits = weeks.map(w => {
    const hits = ev('case_limit_hit').filter(e => weekKey(e.at) === w);
    const tried = new Set([...input.cases.filter(c => weekKey(c.startedAt) === w).map(c => c.userId), ...hits.map(e => e.userId)]);
    const who = (reason: string) => new Set(hits.filter(e => e.payload.reason === reason).map(e => e.userId)).size;
    return { week: w, daily: ratio(who('daily'), tried.size), monthly: ratio(who('monthly'), tried.size) };
  });

  const comments = [...input.comments].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 10);

  return {
    weeks, focus, tiles, prev, funnel, cohorts, traffic, topPages, learning, nextSteps, reliability, cost, reach, limits, comments,
    sentryAvailable: input.sentry !== null,
  };
}

export type WeeklyDashboard = ReturnType<typeof weeklyDashboard>;
