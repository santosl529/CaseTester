// Data-coverage caveat (docs/interviewer-behavior.md v4.1 Rule 11;
// docs/scoring-qa.md "Data-coverage caveat — requested vs. never requested").
// The data-side analogue of assisted-vs-covered for stages: when the candidate
// asked for data that EXISTS in the case and the interviewer never provided it
// — ignored, deferred forever, or wrongly refused — an assumption built on
// that gap is session coverage, not candidate judgment. In run 4 the
// candidate asked about menu prices three times and never got the ledger's
// average-ticket data; the judge only saw one flat "never revealed" list and
// couldn't tell asked-for from never-asked-for.
//
// Deterministic over the `data_request` session events
// (lib/orchestrator/data-requests.ts). The request DETECTION behind those rows
// is a soft signal; everything here — ledger membership, whether it was ever
// revealed — is computed in code against the FINAL revealed set, so a request
// answered late (or re-asked and then answered) is never a gap.

export type DataRequestRow = { subtype: string; turnIndex: number | null; payloadJsonb: unknown };

export type RequestedUnanswered = { ledgerItemId: string; label: string; what: string; turnIndex: number | null };
export type RequestedNotInCase = { what: string; response: string; turnIndex: number | null };

export type DataCoverage = {
  requestedUnanswered: RequestedUnanswered[]; // coverage gap
  requestedNotInCase: RequestedNotInCase[];   // fair game — the data doesn't exist
};

export function summarizeDataRequests(
  rows: DataRequestRow[],
  catalog: { id: string; label: string }[],
  revealedIds: string[],
): DataCoverage {
  const labels = new Map(catalog.map(c => [c.id, c.label]));
  const revealed = new Set(revealedIds);
  const byTurn = [...rows].sort((a, b) => (a.turnIndex ?? Infinity) - (b.turnIndex ?? Infinity));

  const requestedUnanswered: RequestedUnanswered[] = [];
  const requestedNotInCase: RequestedNotInCase[] = [];
  const seenGap = new Set<string>();
  const seenNotInCase = new Set<string>();

  for (const r of byTurn) {
    if (r.subtype === 'classified') continue; // marker: exchange was checked, not a request
    const p = r.payloadJsonb as { what?: unknown; ledgerItemIds?: unknown; ledgerItemId?: unknown; explicit?: unknown } | null;
    if (!p || typeof p.what !== 'string' || !p.what.trim()) continue;
    // A passing mention isn't a request (data-requests.ts): it never becomes a
    // gap, a forced or stale release, or a caveat. Rows from before the field
    // existed count as explicit.
    if (p.explicit === false) continue;
    const what = p.what.trim();
    // One request can cover several ledger items (a "what's inside COGS?"
    // ask); rows logged before that change carry a single ledgerItemId.
    const rawIds: unknown[] = Array.isArray(p.ledgerItemIds) ? p.ledgerItemIds : [p.ledgerItemId];
    const knownIds = rawIds.filter((id): id is string => typeof id === 'string' && labels.has(id));

    if (knownIds.length > 0) {
      // Only a release resolves a request for data that exists — a refusal of
      // existing data is withholding, not a legitimate "we don't have that".
      // Each covered item still unrevealed is its own gap: run 58cb8061's
      // component-split request got beans but never the other-inputs item.
      for (const ledgerItemId of knownIds) {
        if (revealed.has(ledgerItemId) || seenGap.has(ledgerItemId)) continue;
        seenGap.add(ledgerItemId);
        requestedUnanswered.push({ ledgerItemId, label: labels.get(ledgerItemId)!, what, turnIndex: r.turnIndex });
      }
    } else {
      // Retried scoring can re-log the final exchange; dedupe on turn + ask.
      const key = `${r.turnIndex}|${what}`;
      if (seenNotInCase.has(key)) continue;
      seenNotInCase.add(key);
      requestedNotInCase.push({ what, response: r.subtype, turnIndex: r.turnIndex });
    }
  }

  return { requestedUnanswered, requestedNotInCase };
}
