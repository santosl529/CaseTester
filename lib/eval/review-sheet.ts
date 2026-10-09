// The human confirmation step (spec 2026-10-09 §2.4): every proposed serious
// fault, plus runs to read in full, as a markdown sheet with verdict lines;
// parsed back into faults.jsonl. Unknown verdicts are reported, never dropped.
import type { FaultRecord } from './prescreen';

const VERDICTS: Record<string, 'confirmed' | 'rejected'> = { confirmed: 'confirmed', confirm: 'confirmed', yes: 'confirmed', y: 'confirmed', rejected: 'rejected', reject: 'rejected', no: 'rejected', n: 'rejected' };
const SEVERITIES = new Set(['serious', 'moderate', 'minor']);
const ATTRIBUTIONS = new Set(['model', 'orchestrator', 'simulator', 'ambiguous_policy', 'evaluator_uncertain']);

export function renderReviewSheet(faults: FaultRecord[], fullReads: string[]): string {
  const serious = faults.filter(f => f.severity === 'serious' && f.status === 'proposed');
  return [
    '# Batch 18 — fault review', '',
    'For each fault set `verdict:` to confirmed or rejected. Optional: `severity:` (serious/moderate/minor), `attribution:` (model/orchestrator/simulator/ambiguous_policy/evaluator_uncertain), `note:.', '',
    `## Proposed serious faults (${serious.length})`, '',
    ...serious.flatMap(f => [
      `### ${f.id}`,
      `run ${f.runId} · turn ${f.turnIndex} · ${f.category} · attribution ${f.attribution} · recovered ${f.recovered}`, '',
      ...f.context.map(c => `> ${c}`), `> [candidate] ${f.candidateText}`, `> [interviewer, delivered] ${f.delivered}`, '',
      `- quote: "${f.quote}"`, `- expected: ${f.expected}`, `- rule: ${f.rule}`,
      ...(f.codeChanges.length ? [`- code: ${f.codeChanges.join('; ')}`] : []),
      ...(f.rawOutput ? [`- raw model output: \`${f.rawOutput.replace(/`/g, "'")}\``] : []), '',
      'verdict: ', 'note: ', '',
    ]),
    `## Read in full (${fullReads.length} runs with no flags — note any fault the pre-screen missed as a new "### <run>-t<turn>-human" entry)`, '',
    ...fullReads.map(r => `- ${r}`), '',
  ].join('\n');
}

export function parseReviewSheet(md: string) {
  const verdicts = new Map<string, { status: 'confirmed' | 'rejected'; severity?: FaultRecord['severity']; attribution?: FaultRecord['attribution']; note: string }>();
  const unrecognised: string[] = [];
  let id: string | null = null;
  let cur: { status?: 'confirmed' | 'rejected'; severity?: FaultRecord['severity']; attribution?: FaultRecord['attribution']; note: string } = { note: '' };
  const flush = () => { if (id && cur.status) verdicts.set(id, { status: cur.status, ...(cur.severity ? { severity: cur.severity } : {}), ...(cur.attribution ? { attribution: cur.attribution } : {}), note: cur.note }); };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const h = line.match(/^###\s+(\S+)/);
    if (h) { flush(); id = h[1]; cur = { note: '' }; continue; }
    if (!id) continue;
    const kv = line.match(/^(verdict|severity|attribution|note):\s*(.*)$/i);
    if (!kv) continue;
    const key = kv[1].toLowerCase(); const val = kv[2].trim();
    if (key === 'verdict') {
      if (!val) continue;
      const v = VERDICTS[val.toLowerCase()];
      if (v) cur.status = v; else unrecognised.push(`${id}: verdict "${val}"`);
    } else if (key === 'severity' && val) {
      if (SEVERITIES.has(val.toLowerCase())) cur.severity = val.toLowerCase() as FaultRecord['severity']; else unrecognised.push(`${id}: severity "${val}"`);
    } else if (key === 'attribution' && val) {
      if (ATTRIBUTIONS.has(val.toLowerCase())) cur.attribution = val.toLowerCase() as FaultRecord['attribution']; else unrecognised.push(`${id}: attribution "${val}"`);
    } else if (key === 'note') cur.note = val;
  }
  flush();
  return { verdicts, unrecognised };
}

export function applyVerdicts(faults: FaultRecord[], v: ReturnType<typeof parseReviewSheet>['verdicts']): FaultRecord[] {
  return faults.map(f => {
    const x = v.get(f.id);
    return x ? { ...f, status: x.status, severity: x.severity ?? f.severity, attribution: x.attribution ?? f.attribution, note: x.note } : f;
  });
}
