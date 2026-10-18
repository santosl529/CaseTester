// The terms Flux is told to expect (Deepgram keyterm prompting; Lorenzo's
// brief, 17 Oct): session 9ccf0836 transcribed "COGS share" as "Cogshare",
// which no check reads as COGS (the misquote and unit checks match the word,
// in any case). Generic case-interview terms, then the case's own names
// (`sttKeyterms`). Written as the parsers read them; Flux keeps a keyterm's
// casing when it uses it, though not always.
export const GENERIC_KEYTERMS = ['COGS', 'MECE', 'EBITDA', 'P&L', 'SG&A', 'SKU', 'CAGR', 'break-even', 'percentage points'] as const;
// Deepgram: at most 500 tokens across all keyterms; 20–50 terms is its advice.
export const MAX_KEYTERMS = 50;

export function keytermsFor(caseData: { sttKeyterms?: string[] }): string[] {
  return [...new Set([...GENERIC_KEYTERMS, ...(caseData.sttKeyterms ?? [])])].slice(0, MAX_KEYTERMS);
}
