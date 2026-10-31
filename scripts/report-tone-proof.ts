// Report tone proof (31 Oct): the plain-words pass on saved sessions, old next
// to new, with the checks Lorenzo asked for — same ratings per dimension, same
// claims, quotes verbatim, audits pass. No DB write.
//
//   LLM_BUDGET_USD=3 LLM_BUDGET_FILE=<ledger> npx tsx --env-file=.env.local scripts/report-tone-proof.ts <out-dir> <session-id-prefix>…
//
// A session with a stored report: the pass runs on that report as stored (the
// "old" the candidate saw), so ratings and claims are compared against it. A
// session never scored has no old report: the full pipeline runs as a dry run
// (computeScore persist: false — judge, quote audit, verifier, answer-key pass,
// reconciliation, mandate, strong gate, stage caps, floor), and "old" is its
// report before the pass.
//
//   npx tsx --env-file=.env.local scripts/report-tone-proof.ts <out-dir> --reuse=<earlier-out-dir> <session-id-prefix>…
//
// --reuse: no LLM call. The model's output is rebuilt from an earlier run's
// <prefix>.json (its "after" plain fields) and put through this code's audit
// again, on that run's "before" — the check after a rebase. Its topFix was
// never sent then, so it shows as not returned.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { sql, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessions, sessionTurns, revealedData, scores } from '@/db/schema';
import { getCaseById } from '@/lib/cases/loader';
import { requireRunBudget } from '@/lib/llm-budget';
import { RubricScoresSchema, type RubricScores, type FeedbackItem, type MissedOpportunity } from '@/lib/scoring/judge';
import { RUBRIC_DIMENSION_KEYS, RUBRIC_DIMENSION_LABELS, ratingLabel } from '@/lib/scoring/rubric';
import { repairTranscript } from '@/lib/scoring/transcript-artifacts';
import { auditEvidence } from '@/lib/scoring/evidence-audit';
import { computeScore, loadStageRecord } from '@/lib/scoring/score-session';
import { writePlainFeedback, buildPlainPrompt, applyPlainOutput, quotedSpans, verbatim, toneLint, type PlainRejection, type PlainOutput } from '@/lib/scoring/plain-feedback';
import { evidenceQuotes } from '@/lib/scoring/report-dimensions';

const [outDir, ...rest] = process.argv.slice(2);
const reuseDir = rest.find(a => a.startsWith('--reuse='))?.slice('--reuse='.length);
const prefixes = rest.filter(a => !a.startsWith('--'));
if (!outDir || prefixes.length === 0) throw new Error('usage: scripts/report-tone-proof.ts <out-dir> <session-id-prefix>…');

const SECTIONS = ['wentWell', 'needsWork', 'missedOpportunities'] as const;
const SECTION_LABEL = { wentWell: 'Strength', needsWork: 'To work on', missedOpportunities: 'Missed moment' };

function strip(r: RubricScores): RubricScores {
  const out = structuredClone(r);
  for (const k of RUBRIC_DIMENSION_KEYS) for (const s of SECTIONS) for (const i of out[k][s]) delete (i as { plain?: unknown }).plain;
  delete out.topFixPlain;
  return out;
}

const ratingOf = (r: RubricScores, k: (typeof RUBRIC_DIMENSION_KEYS)[number]) => (r[k].notAssessed ? 'not assessed' : ratingLabel(r[k].rating));
const oldText = (r: RubricScores) => [...RUBRIC_DIMENSION_KEYS.flatMap(k => [...r[k].wentWell.map(i => i.point), ...r[k].needsWork.map(i => i.point), ...r[k].missedOpportunities.map(m => m.moment)]), r.topFix];
// What the reader sees after: the plain text where written, the point where it was refused.
const newText = (r: RubricScores) => RUBRIC_DIMENSION_KEYS.flatMap(k => [
  ...[...r[k].wentWell, ...r[k].needsWork].map(i => (i.plain ? Object.values(i.plain).join(' ') : i.point)),
  ...r[k].missedOpportunities.map(m => (m.plain ? Object.values(m.plain).join(' ') : m.moment)),
]).concat(r.topFixPlain ? Object.values(r.topFixPlain).join(' ') : r.topFix);
const lint = (texts: string[]) => texts.reduce((a, t) => { const l = toneLint(t); return { jargon: a.jargon + l.jargon.length, accusing: a.accusing + l.accusing.length }; }, { jargon: 0, accusing: 0 });

function checks(before: RubricScores, after: RubricScores, candidateTexts: string[], rejected: PlainRejection[]) {
  const corpus = candidateTexts.join('\n');
  const ratingDiffs = RUBRIC_DIMENSION_KEYS.filter(k => ratingOf(before, k) !== ratingOf(after, k)).map(k => `${k}: ${ratingOf(before, k)} → ${ratingOf(after, k)}`);
  if (before.overallRating !== after.overallRating) ratingDiffs.push(`overall: ${before.overallRating} → ${after.overallRating}`);
  const audit = auditEvidence(after, candidateTexts);
  const spans = RUBRIC_DIMENSION_KEYS.flatMap(k => SECTIONS.flatMap(s => (after[k][s] as (FeedbackItem | MissedOpportunity)[]).flatMap(i => (i.plain ? quotedSpans(Object.values(i.plain).join('\n')) : []))))
    .concat(after.topFixPlain ? quotedSpans(Object.values(after.topFixPlain).join('\n')) : []);
  const badSpans = spans.filter(sp => !verbatim(sp, corpus));
  const items = RUBRIC_DIMENSION_KEYS.reduce((n, k) => n + SECTIONS.reduce((m, s) => m + after[k][s].length, 0), 0) + (after.topFix.trim() ? 1 : 0);
  return {
    sameRatings: ratingDiffs.length === 0, ratingDiffs,
    sameClaims: isDeepStrictEqual(strip(after), strip(before)),
    quoteAudit: { violations: audit.violations.length, droppedPoints: audit.droppedPoints.length },
    inlineQuotes: { spans: spans.length, notVerbatim: badSpans },
    items, written: items - rejected.length, rejected,
    toneBefore: lint(oldText(before)), toneAfter: lint(newText(after)),
  };
}

const q = (s: string) => `> “${s}”`;

function renderItem(label: string, before: FeedbackItem | MissedOpportunity, after: FeedbackItem | MissedOpportunity, rejected?: string): string {
  const lines: string[] = [`**${label}**`, '', '*Before*', ''];
  if ('point' in before) {
    lines.push(before.point, '', ...before.quotes.map(q));
  } else {
    lines.push(before.moment, '', `A great answer: “${before.betterResponse}”`);
  }
  lines.push('', '*After*', '');
  if (rejected) {
    lines.push(`*(kept in the old wording — the audit refused the rewrite: ${rejected})*`);
  } else if ('point' in after && after.plain) {
    lines.push(`*${after.plain.where}*`, '', `${after.plain.what} ${after.plain.why}`, '', `**${after.plain.next}**`);
    const below = evidenceQuotes(after);
    if (below.length) lines.push('', ...below.map(q));
  } else if (!('point' in after) && after.plain) {
    lines.push(`*${after.plain.where}*`, '', `${after.plain.what} ${after.plain.why}`, '', `Next time, try something like: “${after.betterResponse}”`);
  }
  return lines.join('\n');
}

function render(title: string, mode: string, before: RubricScores, after: RubricScores, c: ReturnType<typeof checks>, qa: Record<string, unknown> | null): string {
  const yes = (b: boolean) => (b ? 'yes' : '**NO**');
  const out: string[] = [`## ${title}`, '', `Mode: ${mode}. Overall: ${before.overallRating ? ratingLabel(before.overallRating) : 'none (partial)'} → ${after.overallRating ? ratingLabel(after.overallRating) : 'none (partial)'}.`, '',
    '| Check | Result |', '|---|---|',
    `| Same rating on every dimension, and overall | ${yes(c.sameRatings)}${c.ratingDiffs.length ? ` (${c.ratingDiffs.join('; ')})` : ''} |`,
    `| Same claims (every point, quote, missed moment, better answer, caveat, top fix — byte for byte) | ${yes(c.sameClaims)} |`,
    `| Evidence-quote audit on the new report | ${c.quoteAudit.violations} quotes stripped, ${c.quoteAudit.droppedPoints} points dropped |`,
    `| Quotes inside the new text verbatim from the candidate | ${c.inlineQuotes.spans - c.inlineQuotes.notVerbatim.length} of ${c.inlineQuotes.spans}${c.inlineQuotes.notVerbatim.length ? ` — not verbatim: ${c.inlineQuotes.notVerbatim.map(s => `“${s}”`).join(', ')}` : ''} |`,
    `| Rewrites that passed the tone audit | ${c.written} of ${c.items}${c.rejected.length ? ` — refused: ${c.rejected.map(r => `${r.id} (${r.reason})`).join('; ')}` : ''} |`,
    `| Jargon terms (MECE, Level 2, pressure test …), before → after | ${c.toneBefore.jargon} → ${c.toneAfter.jargon} |`,
    `| "you did not / never / failed / could not", before → after | ${c.toneBefore.accusing} → ${c.toneAfter.accusing} |`,
  ];
  if (qa) out.push('', `Passes that ran in this scoring (qa counters): judge; quote audit ${qa.evidenceStrips} stripped / ${qa.evidencePointDrops} dropped; verifier ${qa.verifierDrops} dropped; answer-key pass ${qa.answerKeyDrops} removed, ${qa.answerKeyReRates} re-rated; reconciliation ${qa.reconcileMerges} merged, ${qa.gapClaimDrops} gap drops; mandate ${qa.conclusionMandateAdded} added; strong gate ${qa.strongDowngrades} lowered; stage caps ${qa.stageNotAssessed} not assessed, ${qa.stageCaveated} caveated; floor ${qa.caveatFloors}; plain words ${qa.plainWritten} written, ${qa.plainRejected} refused.`);
  for (const k of RUBRIC_DIMENSION_KEYS) {
    out.push('', `### ${RUBRIC_DIMENSION_LABELS[k]} — ${ratingOf(before, k)}${ratingOf(before, k) === ratingOf(after, k) ? ' (unchanged)' : ` → ${ratingOf(after, k)}`}`);
    if (after[k].coverageCaveat) out.push('', `*${after[k].coverageCaveat}*`);
    for (const s of SECTIONS) {
      (before[k][s] as (FeedbackItem | MissedOpportunity)[]).forEach((item, i) => {
        const id = `${k}.${s}.${i}`;
        out.push('', renderItem(`${SECTION_LABEL[s]} ${i + 1}`, item, (after[k][s] as (FeedbackItem | MissedOpportunity)[])[i], c.rejected.find(r => r.id === id)?.reason));
      });
    }
  }
  const topFixRejected = c.rejected.find(r => r.id === 'topFix')?.reason;
  out.push('', '### Top improvement', '', '*Before*', '', before.topFix, '', '*After*', '',
    after.topFixPlain && !topFixRejected
      ? [`*${after.topFixPlain.where}*`, '', `${after.topFixPlain.what} ${after.topFixPlain.why}`, '', `**${after.topFixPlain.next}**`].join('\n')
      : `*(kept in the old wording${topFixRejected ? ` — ${topFixRejected}` : ''})*`);
  return out.join('\n');
}

async function main() {
  const budget = reuseDir ? { summary: () => '$0 (reused output, no LLM call)' } : requireRunBudget('report-tone-proof');
  process.on('exit', () => console.log(`[budget] ${budget.summary()}`));
  mkdirSync(outDir, { recursive: true });
  const sections: string[] = [];
  const summary: string[] = [];
  for (const prefix of prefixes) {
    const session = await db.query.sessions.findFirst({ where: sql`${sessions.id}::text like ${`${prefix}%`}` });
    if (!session) throw new Error(`no session ${prefix}`);
    const caseData = getCaseById(session.caseId);
    const turns = await db.query.sessionTurns.findMany({ where: eq(sessionTurns.sessionId, session.id), orderBy: (t, { asc }) => [asc(t.turnIndex)] });
    const { turns: transcript } = repairTranscript(turns.map(t => ({ role: t.role, text: t.text, turnIndex: t.turnIndex })));
    const candidateTexts = transcript.filter(t => t.role === 'candidate').map(t => t.text);
    const stored = await db.query.scores.findFirst({ where: eq(scores.sessionId, session.id) });
    let before: RubricScores, after: RubricScores, rejected: PlainRejection[], mode: string, qa: Record<string, unknown> | null = null;
    if (reuseDir) {
      const saved = JSON.parse(readFileSync(path.join(reuseDir, `${session.id.slice(0, 8)}.json`), 'utf8'));
      before = RubricScoresSchema.parse(saved.before);
      const savedAfter = RubricScoresSchema.parse(saved.after);
      const revealedRows = await db.query.revealedData.findMany({ where: eq(revealedData.sessionId, session.id) });
      const stageRecord = await loadStageRecord(session.id, session.flagsJsonb as Record<string, unknown>, turns, revealedRows, caseData);
      const ctx = { transcript, stageRecord, ideas: caseData.answerKeyIdeas };
      const { entries } = buildPlainPrompt(before, ctx);
      const output: PlainOutput = {};
      for (const e of entries) {
        if (e.section === 'topFix') { if (savedAfter.topFixPlain) output[e.id] = savedAfter.topFixPlain; continue; }
        const p = (savedAfter[e.dimension!][e.section][e.index] as FeedbackItem | MissedOpportunity).plain;
        if (p) output[e.id] = p;
      }
      ({ rubric: after, rejected } = applyPlainOutput(before, output, entries, ctx));
      // A rewrite that run refused was not saved: show that run's reason, and the topFix as not sent then.
      const earlier = new Map<string, string>((saved.checks.rejected as PlainRejection[]).map(r => [r.id, r.reason]));
      rejected = rejected.map(r => (r.reason !== 'not returned' ? r
        : { id: r.id, reason: earlier.has(r.id) ? `refused in that run: ${earlier.get(r.id)}` : r.id === 'topFix' ? 'not sent in that run (added after it)' : r.reason }));
      const same = isDeepStrictEqual(after, savedAfter);
      mode = `reused ${reuseDir}/${session.id.slice(0, 8)}.json (no LLM call): its output through this code's audit — plain fields ${same ? 'identical to that run' : 'DIFFER from that run'}`;
      qa = saved.qa;
    } else if (stored) {
      before = RubricScoresSchema.parse(stored.rubricJsonb);
      const revealedRows = await db.query.revealedData.findMany({ where: eq(revealedData.sessionId, session.id) });
      const stageRecord = await loadStageRecord(session.id, session.flagsJsonb as Record<string, unknown>, turns, revealedRows, caseData);
      const plain = await writePlainFeedback(before, { transcript, stageRecord, ideas: caseData.answerKeyIdeas });
      if (plain.skipped) throw new Error(`${prefix}: pass skipped — ${plain.skipped}`);
      ({ rubric: after, rejected } = plain);
      mode = `the stored report (scored ${stored.createdAt.toISOString().slice(0, 10)}), plain-words pass only`;
    } else {
      const c = await computeScore({ sessionId: session.id, userId: session.userId, persist: false });
      if (c.plain.skipped) throw new Error(`${prefix}: pass skipped — ${c.plain.skipped}`);
      ({ assessed: before, rubric: after } = c);
      rejected = c.plain.rejected;
      qa = c.qa;
      mode = 'never scored — full scoring as a dry run (no DB write); "before" is its report before the plain-words pass';
    }
    const c = checks(before, after, candidateTexts, rejected);
    const title = `${session.id.slice(0, 8)} — ${caseData.title} (${session.caseId})`;
    sections.push(render(title, mode, before, after, c, qa));
    summary.push(`| ${session.id.slice(0, 8)} | ${session.caseId} | ${c.sameRatings ? 'yes' : 'NO'} | ${c.sameClaims ? 'yes' : 'NO'} | ${c.quoteAudit.violations} / ${c.quoteAudit.droppedPoints} | ${c.inlineQuotes.spans - c.inlineQuotes.notVerbatim.length}/${c.inlineQuotes.spans} | ${c.written}/${c.items} | ${c.toneBefore.jargon} → ${c.toneAfter.jargon} | ${c.toneBefore.accusing} → ${c.toneAfter.accusing} |`);
    writeFileSync(path.join(outDir, `${session.id.slice(0, 8)}.json`), JSON.stringify({ sessionId: session.id, caseId: session.caseId, mode, checks: c, qa, before, after }, null, 1));
    console.log(`${prefix}: ratings ${c.sameRatings ? 'same' : 'DIFFER'}, claims ${c.sameClaims ? 'same' : 'DIFFER'}, rewrites ${c.written}/${c.items} · ${budget.summary()}`);
  }
  const head = ['# Report tone — old vs new', '', `Sessions: ${prefixes.join(', ')}. Spend: ${budget.summary()}.`, '',
    '| Session | Case | Same ratings | Same claims | Quote audit (stripped / dropped) | Inline quotes verbatim | Rewrites passed | Jargon before → after | Accusing before → after |',
    '|---|---|---|---|---|---|---|---|---|', ...summary].join('\n');
  writeFileSync(path.join(outDir, 'side-by-side.md'), `${head}\n\n${sections.join('\n\n---\n\n')}\n`);
  process.exit(0);
}

main();
