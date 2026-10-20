// Anchor audit (19 Oct, Lorenzo's brief after batch 32): an LLM proposes, per
// ledger item, the names a candidate would use to ask for it and the asks it
// answers without naming it — the case's `factAnchors.names` and `covers`,
// which decide whether an ask the model would refuse is remapped to the item
// (fact-check.ts findFalseRefusals, coverageOf; turn-data.ts). Batch 32: three
// false refusals of data the case held (Larkspur Marcus t8, Tyler t6, t22),
// each an ask no anchor named. Nothing is applied: the script writes the
// proposal and a diff for review, lints it (a phrase another item already
// owns, a bare generic word), and replays a file of real asks through today's
// anchors and the proposed ones.
//
//   npx tsx scripts/anchor-audit.ts --case=prof-002 --pdf-text=<case PDF as text> [--asks=evals/anchor-asks-batch32.json] [--out=<dir>] --dry
//   LLM_BUDGET_USD=2 npx tsx --env-file=.env.local scripts/anchor-audit.ts --case=prof-002 --pdf-text=<…> [--asks=…] [--out=<dir>]
//   npx tsx scripts/anchor-audit.ts --case=prof-002 --proposal=<dir>/prof-002.anchor-proposal.json --asks=…   (re-test a reviewed proposal, free)
//   npx tsx scripts/anchor-audit.ts --case=prof-002 --proposal=<reviewed proposal> --apply   (merge its lint-clean new phrases into cases/<id>.json, free)
//
// Review = edit the proposal JSON: delete a phrase that would send an ask to
// the wrong item (a finer cut, another route or period), add one the model
// missed. The matcher splits a declared ask at commas, "and", "or", "plus" and
// matches each part on its own (coverageOf), and tries names before covers —
// so a two-part ask ("average fare and variable cost per flight") needs a cover
// for each part, and a cover that spans the joint ("ashford and brookhaven")
// covers both parts. --apply rewrites only the factAnchors block.
//
// Paid: one Opus 5.5 call per case (≈ $0.2–0.5; --dry prints the estimate).
// The PDF must be given as text (no PDF reader in the dependencies): any
// extractor will do; the model reads it for the clarifying-question bank and
// the reveal-if-asked wording.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { getCaseById } from '@/lib/cases/loader';
import { CaseSchema } from '@/lib/cases/schema';
import { anthropicClient } from '@/lib/anthropic-client';
import { requireRunBudget } from '@/lib/llm-budget';
import { SCORING_MODEL_ID, FALLBACK_BETA, FALLBACKS } from '@/lib/models';
import { coverageOf, factBaseFor, findFalseRefusals } from '@/lib/orchestrator/fact-check';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const ProposalSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    names: z.array(z.string()),
    covers: z.array(z.string()),
    notHeld: z.array(z.string()),
    asks: z.array(z.string()).default([]),
    note: z.string(),
  })),
});
export type AnchorProposal = z.infer<typeof ProposalSchema>;

type FactAnchorsJson = { names?: Record<string, string[]>; covers?: Record<string, string[]>; groups?: { names: string[]; items: string[] }[]; promptFacts?: { id: string; names: string[] }[] };
type CaseJson = ReturnType<typeof getCaseById> & {
  factAnchors?: FactAnchorsJson;
  quoteAnchors?: { item: string; names: string[] }[];
};

const lc = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
// One word that names nothing on its own (fact-check's own generic set, plus the
// case nouns every item shares): never a name or a cover by itself.
const GENERIC_ALONE = new Set(['fare', 'fares', 'cost', 'costs', 'price', 'prices', 'revenue', 'sales', 'profit', 'margin', 'data', 'numbers',
  'routes', 'route', 'flights', 'customers', 'share', 'market', 'growth', 'volume', 'competition', 'competitors', 'survey', 'plan', 'estimate']);

export function buildPrompt(c: CaseJson, pdfText: string | null): string {
  const fa: FactAnchorsJson = c.factAnchors ?? {};
  const qa = c.quoteAnchors ?? [];
  const items = c.dataLedger.map(d => ({
    id: d.id, label: d.label, value: d.value, releaseWhen: d.releaseWhen,
    exhibits: c.exhibits.filter(e => (e.coversLedgerItems ?? []).includes(d.id)).map(e => e.id),
    names: [...new Set([...(fa.names?.[d.id] ?? []), ...qa.filter(q => q.item === d.id).flatMap(q => q.names)])],
    covers: fa.covers?.[d.id] ?? [],
  }));
  return `You are auditing the data anchors of a consulting case-interview simulator. An AI interviewer releases case data only from a ledger of items. When the candidate asks for something, the interviewer model declares the ask in a short phrase (e.g. "competition on Ashford and Brookhaven", "the FY2023 versus FY2025 cost breakdown"). If the model maps the ask to no item, code is about to answer "I don't have that" — and first checks the phrase against two lists per item:

- names: phrases that NAME the item itself. If the declared phrase is the name plus only neutral words (the, average, total, both years, today, trend, data, figures), the ask is remapped to that item and the item's value is said. Example names for "Hub–Lakeport average one-way fare": "lakeport fare", "fare on lakeport", "lakeport ticket price".
- covers: phrases of ASKS that the item answers truthfully although they don't name it. If a cover phrase appears in the declared phrase (and no further cut sits beside it, like "by store" or "per day"), the item is given. Example: "aircraft size" is a cover of the competitor-costs item because its value says the competitor flies larger planes.

Failures this audit must prevent (all real): "competition on Ashford and Brookhaven" refused while the case said no airline flies those routes nonstop; "average fare and variable cost per flight" refused while the case held them per route; "the FY2023 versus FY2025 cost breakdown" refused while the case held fixed costs for both years, flat fuel and wages, and contribution totals. Equally real is the opposite failure: a phrase that sends an ask to an item that doesn't answer it (a finer cut, another period, another route) makes the interviewer state a wrong or irrelevant fact.

For EVERY ledger item below, propose:
- names: 2–8 lowercase phrases a candidate or the interviewer model would plausibly use to ask for exactly this item. Each must name this item specifically — never a phrase that equally names another item in the list (check the other items' labels and existing names). No single generic word (fare, cost, revenue, routes, competition). No figures. Do not repeat existing names.
- covers: 0–8 lowercase phrases of asks the item's VALUE answers fully and truthfully though they don't name it (another way of asking for the same fact, or a question the fact settles, e.g. "any competitor on the new routes" for a value saying no other airline flies them). Only phrases whose honest answer is this item's value. Do not repeat existing covers.
- notHeld: 0–5 phrases of nearby asks this item does NOT answer (a finer cut, another period, a breakdown it lacks, the basis or source of an estimate) — for the human reviewer; never applied.
- asks: 3–6 realistic phrases the interviewer model might declare when a candidate asks for this item, including at least one two-part ask joined by "and" — the script replays them through the matcher with your names and covers to measure what they catch.
- note: one sentence on the reasoning or any ambiguity the reviewer should check.

How the matcher reads a declared phrase: it splits it at commas, "and", "or" and "plus" and matches each part on its own; names are tried before covers; a name matches only when the rest of its part is neutral words; a cover matches anywhere in its part unless a further cut sits beside it ("by store", "per day"); a cover that spans the joint ("ashford and brookhaven") covers both parts. So a two-part ask needs a phrase for each part, and a short generic cover ("average fare") fires on every part that contains it — use one only when every such ask in this case is answered by this item.

Keep phrases short (2–6 words), in the words candidates actually use. Return every item id exactly as given.

CASE PROMPT (read to the candidate first):
${c.prompt}

LEDGER ITEMS (id, label, value, when it is released, the exhibits that show it, existing names, existing covers):
${items.map(i => `- ${i.id} | ${i.label} | ${i.value} | release: ${i.releaseWhen}${i.exhibits.length ? ` | on ${i.exhibits.join(', ')}` : ''}\n    existing names: ${JSON.stringify(i.names)}\n    existing covers: ${JSON.stringify(i.covers)}`).join('\n')}

EXHIBITS:
${c.exhibits.map(e => `- ${e.id}: ${e.title} (covers ${(e.coversLedgerItems ?? []).join(', ')})`).join('\n')}

PROMPT FACTS (already known to the candidate; not ledger items): ${JSON.stringify((fa.promptFacts ?? []).map(p => ({ id: p.id, names: p.names })))}
GROUPS (phrases that name several items at once): ${JSON.stringify(fa.groups ?? [])}
${pdfText ? `\nTHE CASE AUTHOR'S GUIDE (the clarifying-question bank and reveal-if-asked tables show how candidates ask for each fact):\n${pdfText}` : ''}`;
}

export type LintedPhrase = { phrase: string; kind: 'name' | 'cover'; status: 'new' | 'exists' | 'dropped'; why?: string };

// The proposal against today's anchors: what is new, what already exists, and what is dropped and why.
export function lintProposal(c: CaseJson, p: AnchorProposal): Record<string, LintedPhrase[]> {
  const fa: FactAnchorsJson = c.factAnchors ?? {};
  // Names and covers are owned separately: a name matches only a plain ask, a cover
  // anywhere in it, so an item's own name may also be added as its cover.
  const namedBy = new Map<string, string>();
  const coveredBy = new Map<string, string>();
  for (const [id, ns] of Object.entries(fa.names ?? {})) ns.forEach(n => namedBy.set(lc(n), id));
  for (const [id, cs] of Object.entries(fa.covers ?? {})) cs.forEach(n => coveredBy.set(lc(n), id));
  for (const q of c.quoteAnchors ?? []) q.names.forEach(n => namedBy.set(lc(n), q.item));
  for (const pf of fa.promptFacts ?? []) pf.names.forEach(n => namedBy.set(lc(n), pf.id));
  const proposedBy = new Map<string, Set<string>>();
  for (const it of p.items) for (const x of [...it.names, ...it.covers]) {
    const k = lc(x);
    proposedBy.set(k, new Set([...(proposedBy.get(k) ?? []), it.id]));
  }
  const ledgerIds = new Set(c.dataLedger.map(d => d.id));
  const caseFigures = new Set([c.prompt, ...c.dataLedger.map(d => d.value)].join(' ').match(/\d[\d,.]*\d|\d/g)?.map(x => x.replace(/,/g, '')) ?? []);
  const out: Record<string, LintedPhrase[]> = {};
  for (const it of p.items) {
    if (!ledgerIds.has(it.id)) continue;
    const rows: LintedPhrase[] = [];
    const lint = (raw: string, kind: 'name' | 'cover') => {
      const phrase = lc(raw);
      const owner = kind === 'name' ? namedBy.get(phrase) ?? coveredBy.get(phrase) : coveredBy.get(phrase) ?? (namedBy.get(phrase) === it.id ? undefined : namedBy.get(phrase));
      if (owner === it.id) return rows.push({ phrase, kind, status: 'exists' });
      if (owner) return rows.push({ phrase, kind, status: 'dropped', why: `already anchors ${owner}` });
      // A name names one item; a cover may answer an ask with several items at once ("cost breakdown").
      if (kind === 'name' && (proposedBy.get(phrase)?.size ?? 0) > 1) return rows.push({ phrase, kind, status: 'dropped', why: `proposed for ${[...proposedBy.get(phrase)!].join(' and ')}` });
      if (phrase.length < 3 || GENERIC_ALONE.has(phrase)) return rows.push({ phrase, kind, status: 'dropped', why: 'a generic word alone' });
      // A cover may carry a case figure ("the 70% load assumption"); a name may not.
      if (/\d/.test(phrase) && (kind === 'name' || !caseFigures.has(phrase.match(/\d[\d,.]*/)![0].replace(/,/g, '')))) return rows.push({ phrase, kind, status: 'dropped', why: 'carries a figure' });
      rows.push({ phrase, kind, status: 'new' });
    };
    it.names.forEach(n => lint(n, 'name'));
    it.covers.forEach(n => lint(n, 'cover'));
    out[it.id] = rows;
  }
  return out;
}

// The case with the proposal's new phrases merged into factAnchors (a new id, so the fact-base cache keeps both).
export function mergeProposal(c: CaseJson, linted: Record<string, LintedPhrase[]>): CaseJson {
  const fa: FactAnchorsJson = c.factAnchors ?? {};
  const names: Record<string, string[]> = { ...(fa.names ?? {}) };
  const covers: Record<string, string[]> = { ...(fa.covers ?? {}) };
  for (const [id, rows] of Object.entries(linted)) {
    const n = rows.filter(r => r.status === 'new' && r.kind === 'name').map(r => r.phrase);
    const cv = rows.filter(r => r.status === 'new' && r.kind === 'cover').map(r => r.phrase);
    if (n.length) names[id] = [...(names[id] ?? []), ...n];
    if (cv.length) covers[id] = [...(covers[id] ?? []), ...cv];
  }
  return { ...c, id: `${c.id}+anchor-proposal`, factAnchors: { ...fa, names, covers } } as CaseJson;
}

export type AskCase = { case: string; source: string; what: string; expect: { items: string[]; refused: boolean } };
export type AskResult = { items: string[]; refused: string | null };

// What code makes of an ask the model declared with no item: a held item it
// names (findFalseRefusals → released), else the case's covers (coverageOf),
// and whatever nothing covers is refused (turn-data.ts).
export function resolveAsk(c: CaseJson, what: string): AskResult {
  const fb = factBaseFor(c as never);
  const ledgerIds = new Set(c.dataLedger.map(d => d.id));
  const named = [...new Set(findFalseRefusals(`I don't have ${what}.`, fb, new Set()).flatMap(f => f.items))].filter(id => ledgerIds.has(id));
  if (named.length) return { items: named, refused: null };
  const cov = coverageOf(what, fb);
  const items = cov.items.filter(id => ledgerIds.has(id));
  // An entry covered only at a coarser cut (a count of a figure-less item): its item, and the entry refused (E1; round 5 Task 50).
  const coarse = cov.coarse.map(c => ({ what: c.what, ids: c.ids.filter(id => ledgerIds.has(id)) })).filter(c => c.ids.length > 0);
  if (items.length === 0 && cov.promptFacts.length === 0 && coarse.length === 0) return { items: [], refused: what };
  const refused = [...coarse.map(c => c.what), ...(cov.rest ? [cov.rest] : [])];
  return { items: [...new Set([...items, ...coarse.flatMap(c => c.ids)])], refused: refused.length > 0 ? refused.join(' and ') : null };
}

function verdict(r: AskResult, e: AskCase['expect']): string {
  const itemsOk = e.items.every(id => r.items.includes(id)) && r.items.every(id => e.items.includes(id));
  const refusedOk = e.refused === (r.refused !== null);
  return itemsOk && refusedOk ? 'ok' : 'MISS';
}

function diffMarkdown(c: CaseJson, p: AnchorProposal, linted: Record<string, LintedPhrase[]>): string {
  const lines = [`# Anchor audit — ${c.id}`, '', 'New phrases are proposals for review; dropped ones are listed with the reason. `notHeld` is for the reviewer only.', ''];
  for (const it of p.items) {
    const rows = linted[it.id] ?? [];
    lines.push(`## ${it.id}`, '', `_${it.note}_`, '');
    for (const r of rows) lines.push(`- ${r.status === 'new' ? '**+**' : r.status === 'exists' ? '=' : '~~'} ${r.kind}: "${r.phrase}"${r.status === 'dropped' ? `~~ — ${r.why}` : ''}`);
    if (it.notHeld.length) lines.push(`- not held (review only): ${it.notHeld.map(x => `"${x}"`).join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

async function propose(c: CaseJson, pdfText: string | null): Promise<AnchorProposal> {
  requireRunBudget('anchor-audit');
  const client = anthropicClient();
  const response = await client.beta.messages.stream({
    model: SCORING_MODEL_ID,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: buildPrompt(c, pdfText) }],
    output_config: { format: betaZodOutputFormat(ProposalSchema), effort: 'high' },
    betas: [FALLBACK_BETA],
    fallbacks: FALLBACKS,
  }).finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('the model declined the request (stop_reason: refusal)');
  if (!response.parsed_output) throw new Error(`no structured output (stop_reason: ${response.stop_reason})`);
  console.log(`[anchor-audit] ${c.id}: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output tokens`);
  return response.parsed_output;
}

async function main() {
  const caseId = arg('case');
  if (!caseId) throw new Error('--case=<id> is required');
  const c = getCaseById(caseId) as CaseJson;
  const pdfText = arg('pdf-text') ? readFileSync(arg('pdf-text')!, 'utf8') : null;
  const outDir = arg('out') ?? 'anchor-audit';
  const asks: AskCase[] = arg('asks') ? (JSON.parse(readFileSync(arg('asks')!, 'utf8')) as AskCase[]).filter(a => a.case === caseId) : [];

  let proposal: AnchorProposal;
  if (arg('proposal')) {
    proposal = JSON.parse(readFileSync(arg('proposal')!, 'utf8')) as AnchorProposal;
  } else if (process.argv.includes('--dry')) {
    const prompt = buildPrompt(c, pdfText);
    const inTok = Math.round(prompt.length / 3.6);
    // Opus 5.5: $4 / $20 per MTok; the answer plus thinking ≈ 6–15k tokens.
    console.log(`[anchor-audit] --dry ${caseId}: prompt ${prompt.length} chars ≈ ${inTok} tokens; estimate ≈ $${(inTok * 4e-6 + 6000 * 20e-6).toFixed(2)}–$${(inTok * 4e-6 + 15000 * 20e-6).toFixed(2)} (Opus 5.5, effort high)`);
    proposal = { items: [] };
  } else {
    proposal = await propose(c, pdfText);
  }

  const linted = lintProposal(c, proposal);
  const merged = mergeProposal(c, linted);
  if (proposal.items.length) {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    if (!arg('proposal')) writeFileSync(path.join(outDir, `${caseId}.anchor-proposal.json`), JSON.stringify(proposal, null, 2) + '\n');
    writeFileSync(path.join(outDir, `${caseId}.anchor-diff.md`), diffMarkdown(c, proposal, linted));
    const counts = Object.values(linted).flat().reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {} as Record<string, number>);
    console.log(`[anchor-audit] ${caseId}: ${JSON.stringify(counts)} → ${path.join(outDir, `${caseId}.anchor-diff.md`)}`);
  }
  if (process.argv.includes('--apply')) {
    if (!arg('proposal')) throw new Error('--apply needs --proposal=<reviewed proposal>');
    const file = path.join('cases', `${caseId}.json`);
    const text = readFileSync(file, 'utf8');
    const fa: FactAnchorsJson = (JSON.parse(text) as CaseJson).factAnchors ?? {};
    const mfa: FactAnchorsJson = merged.factAnchors ?? {};
    // Only factAnchors.names and .covers are rewritten (their keys are item ids;
    // JSON.stringify would reorder a prompt fact's figure keys elsewhere in the block).
    const ind = (o: unknown, pad: string) => JSON.stringify(o, null, 2).replace(/\n/g, `\n${pad}`);
    let out = text;
    for (const key of ['names', 'covers'] as const) {
      const was = `    "${key}": ${ind(fa[key] ?? {}, '    ')}`;
      const now = `    "${key}": ${ind(mfa[key] ?? {}, '    ')}`;
      if (out.includes(was)) out = out.replace(was, now);
      else if (fa[key] === undefined) out = out.replace(`  "factAnchors": {\n`, `  "factAnchors": {\n${now},\n`);
      else throw new Error(`${file}: factAnchors.${key} isn't in JSON.stringify form — apply by hand`);
    }
    writeFileSync(file, out);
    const check = CaseSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (!check.success) { writeFileSync(file, text); throw new Error(`${file}: the merged case fails the schema — not applied: ${check.error.message}`); }
    console.log(`[anchor-audit] applied to ${file}`);
  }
  // The model's own example asks: what the proposed anchors catch (the item given) and what they send elsewhere.
  const probe = proposal.items.flatMap(it => (it.asks ?? []).map(what => ({ id: it.id, what, got: resolveAsk(merged, what) })));
  if (probe.length) {
    const caught = probe.filter(x => x.got.items.includes(x.id));
    console.log(`[anchor-audit] ${caseId}: the model's ${probe.length} example asks — ${caught.length} reach their item with the proposal`);
    for (const x of probe.filter(p => !p.got.items.includes(p.id))) console.log(`   miss ${x.id}: "${x.what}" → ${x.got.items.join(', ') || 'nothing'}${x.got.refused ? `; refuse "${x.got.refused}"` : ''}`);
  }
  for (const a of asks) {
    const before = resolveAsk(c, a.what);
    const after = resolveAsk(merged, a.what);
    const show = (r: AskResult) => `${r.items.length ? `give ${r.items.join(', ')}` : 'give nothing'}${r.refused ? `; refuse "${r.refused}"` : ''}`;
    console.log(`${a.source}: "${a.what}"\n   today:    ${show(before)} — ${verdict(before, a.expect)}\n   proposed: ${show(after)} — ${verdict(after, a.expect)}`);
  }
}

if (process.argv[1] && path.basename(process.argv[1]).startsWith('anchor-audit')) main().catch(e => { console.error(e); process.exit(1); });
