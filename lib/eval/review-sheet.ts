// The human confirmation step (spec 2026-10-09 §2.4): every proposed serious
// fault, then every proposed moderate one, plus runs to read in full, as a
// markdown sheet with verdict lines; parsed back into faults.jsonl. Unknown verdicts are reported, never dropped.
import { ProposedFaultSchema, type FaultRecord } from './prescreen';
import type { ScorecardRow } from './scorecard';

const VERDICTS: Record<string, 'confirmed' | 'rejected'> = { confirmed: 'confirmed', confirm: 'confirmed', yes: 'confirmed', y: 'confirmed', rejected: 'rejected', reject: 'rejected', no: 'rejected', n: 'rejected' };
const SEVERITIES = new Set(['serious', 'moderate', 'minor']);
const ATTRIBUTIONS = new Set(['model', 'orchestrator', 'simulator', 'ambiguous_policy', 'evaluator_uncertain']);
// The pre-screen's categories, so a human-found fault is filed like a proposed one.
const CATEGORY_LIST: readonly string[] = ProposedFaultSchema.shape.category.options;
const CATEGORIES = new Set(CATEGORY_LIST);

function collapseNewlines(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ');
}

// What the sheet asks a human to review: every proposed serious fault, then
// every proposed moderate one (follow-up 9 Oct); minor proposals stay off.
export function proposedForReview(faults: FaultRecord[]) {
  const proposed = faults.filter(f => f.status === 'proposed');
  return { serious: proposed.filter(f => f.severity === 'serious'), moderate: proposed.filter(f => f.severity === 'moderate') };
}

function faultBlock(f: FaultRecord): string[] {
  return [
    `### ${f.id}`,
    `run ${f.runId} · turn ${f.turnIndex} · ${f.category} · attribution ${f.attribution} · recovered ${f.recovered}`, '',
    ...f.context.map(c => `> ${collapseNewlines(c)}`), `> [candidate] ${collapseNewlines(f.candidateText)}`, `> [interviewer, delivered] ${collapseNewlines(f.delivered)}`, '',
    `- quote: "${collapseNewlines(f.quote)}"`, `- expected: ${collapseNewlines(f.expected)}`, `- rule: ${f.rule}`,
    ...(f.codeChanges.length ? [`- code: ${f.codeChanges.join('; ')}`] : []),
    ...(f.rawOutput ? [`- raw model output: \`${collapseNewlines(f.rawOutput).replace(/`/g, "'")}\``] : []), '',
    'verdict: ', 'note: ', '',
  ];
}

// Every code flag (loop, repeated_short_probe, question_withheld, …) is a
// review candidate (follow-up 9 Oct); flagged runs are already left out of
// the random full reads.
export function codeFlagLines(rows: Pick<ScorecardRow, 'runId' | 'codeFlags'>[]): string[] {
  return rows.flatMap(r => r.codeFlags.map(f => `- ${f.kind} · run ${r.runId} · turn ${f.turnIndex ?? '—'} · ${collapseNewlines(f.detail)}`));
}

export function renderReviewSheet(faults: FaultRecord[], fullReads: string[], codeFlagged: Pick<ScorecardRow, 'runId' | 'codeFlags'>[] = []): string {
  const { serious, moderate } = proposedForReview(faults);
  const flagLines = codeFlagLines(codeFlagged);
  const flaggedRuns = codeFlagged.filter(r => r.codeFlags.length).length;
  return [
    '# Batch 18 — fault review', '',
    'For each fault set `verdict:` to confirmed or rejected. Optional: `severity:` (serious/moderate/minor), `attribution:` (model/orchestrator/simulator/ambiguous_policy/evaluator_uncertain), `note:`.', '',
    `## Proposed serious faults (${serious.length})`, '',
    ...serious.flatMap(faultBlock),
    `## Proposed moderate faults (${moderate.length})`, '',
    ...moderate.flatMap(faultBlock),
    `## Code-flagged runs to check (${flagLines.length} flags in ${flaggedRuns} runs — read around each turn; note any real fault as a human-found entry below)`, '',
    'turn = the candidate\'s line; the interviewer\'s reply is turn + 1.', '',
    ...flagLines, '',
    `## Read in full (${fullReads.length} runs with no flags — note any fault the pre-screen missed as a new section like below)`, '',
    ...fullReads.map(r => `- ${r}`), '',
    '## Human-found faults (from full reads — add a new section per entry)', '',
    '```markdown', '### <run>-t<turn>-human', `category: <${CATEGORY_LIST.join('|')}>`, 'severity: <serious|moderate|minor>', 'quote: (optional) the text snippet', 'expected: what should have happened', 'rule: which rule violated', 'attribution: (optional, default evaluator_uncertain)', 'note: (optional) any notes', '```', '',
  ].join('\n');
}

export function parseReviewSheet(md: string) {
  const verdicts = new Map<string, { status: 'confirmed' | 'rejected'; severity?: FaultRecord['severity']; attribution?: FaultRecord['attribution']; note: string }>();
  const humanFaults: FaultRecord[] = [];
  const unrecognised: string[] = [];
  let id: string | null = null;
  let isHuman = false;
  let inCodeBlock = false;
  let fenceOpenedAt = 0;
  let cur: {
    status?: 'confirmed' | 'rejected';
    severity?: FaultRecord['severity'];
    attribution?: FaultRecord['attribution'];
    note: string;
    category?: string;
    expected?: string;
    rule?: string;
    quote?: string;
  } = { note: '' };

  const flush = () => {
    if (!id) return;
    if (isHuman) {
      // Validate required fields for human fault
      if (!cur.category || !cur.severity || !cur.expected || !cur.rule) {
        const missing = [];
        if (!cur.category) missing.push('category');
        if (!cur.severity) missing.push('severity');
        if (!cur.expected) missing.push('expected');
        if (!cur.rule) missing.push('rule');
        unrecognised.push(`${id}: missing required fields ${missing.join(', ')}`);
        return;
      }
      // Validate category and severity values
      if (!CATEGORIES.has(cur.category)) {
        unrecognised.push(`${id}: invalid category "${cur.category}"`);
        return;
      }
      if (!SEVERITIES.has(cur.severity)) {
        unrecognised.push(`${id}: invalid severity "${cur.severity}"`);
        return;
      }
      const match = id.match(/^(.+)-t(\d+)-human$/);
      if (!match) {
        unrecognised.push(`${id}: invalid human fault id format`);
        return;
      }
      const fault: FaultRecord = {
        id,
        runId: match[1],
        turnIndex: parseInt(match[2], 10),
        category: cur.category as FaultRecord['category'],
        severity: cur.severity,
        quote: cur.quote ?? '',
        expected: cur.expected,
        rule: cur.rule,
        attribution: (cur.attribution as FaultRecord['attribution']) ?? 'evaluator_uncertain',
        recovered: false,
        candidateText: '',
        context: [],
        rawOutput: null,
        codeChanges: [],
        delivered: '',
        source: 'human',
        status: 'confirmed',
        note: cur.note,
      };
      if (humanFaults.some(f => f.id === id)) {
        unrecognised.push(`duplicate human id ${id} — this entry was ignored (use a different turn or merge the two)`);
        return;
      }
      humanFaults.push(fault);
    } else {
      // Prescreen verdict
      if (id && cur.status) {
        verdicts.set(id, {
          status: cur.status,
          ...(cur.severity ? { severity: cur.severity } : {}),
          ...(cur.attribution ? { attribution: cur.attribution } : {}),
          note: cur.note,
        });
      }
    }
  };

  const lines = md.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim();
    // Check for code block fences
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (inCodeBlock) fenceOpenedAt = n + 1;
      continue;
    }
    // Skip everything inside code blocks
    if (inCodeBlock) continue;

    const h = line.match(/^###\s+(\S+)/);
    if (h) {
      flush();
      id = h[1];
      isHuman = /^.+-t\d+-human$/.test(id);
      cur = { note: '' };
      continue;
    }
    if (!id) continue;
    const kv = line.match(/^(verdict|severity|attribution|note|category|expected|rule|quote):\s*(.*)$/i);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim();
    if (key === 'verdict') {
      if (!val) continue;
      const v = VERDICTS[val.toLowerCase()];
      if (v) cur.status = v;
      else unrecognised.push(`${id}: verdict "${val}"`);
    } else if (key === 'severity' && val) {
      if (SEVERITIES.has(val.toLowerCase())) cur.severity = val.toLowerCase() as FaultRecord['severity'];
      else unrecognised.push(`${id}: severity "${val}"`);
    } else if (key === 'attribution' && val) {
      if (ATTRIBUTIONS.has(val.toLowerCase())) cur.attribution = val.toLowerCase() as FaultRecord['attribution'];
      else unrecognised.push(`${id}: attribution "${val}"`);
    } else if (key === 'note') cur.note = val;
    else if (key === 'category' && val) cur.category = val.toLowerCase();
    else if (key === 'expected' && val) cur.expected = val;
    else if (key === 'rule' && val) cur.rule = val;
    else if (key === 'quote' && val) cur.quote = val;
  }
  flush();
  if (inCodeBlock) unrecognised.push(`unclosed code fence — everything after line ${fenceOpenedAt} was ignored`);
  return { verdicts, humanFaults, unrecognised };
}

export function applyVerdicts(faults: FaultRecord[], v: ReturnType<typeof parseReviewSheet>['verdicts']): FaultRecord[] {
  return faults.map(f => {
    const x = v.get(f.id);
    return x ? { ...f, status: x.status, severity: x.severity ?? f.severity, attribution: x.attribution ?? f.attribution, note: x.note } : f;
  });
}
