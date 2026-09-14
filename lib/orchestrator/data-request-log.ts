import { db } from '@/db/client';
import { sessionEvents } from '@/db/schema';
import type { Phase } from './state-machine';
import {
  toDataRequestEvents, classifiedMarkerEvent, type DetectedDataRequest, type DataRequestEvent,
} from './data-requests';

// Persist one exchange's Rule 11 classification: a `data_request` row per
// detected request plus a `classified` marker, so "checked, nothing asked" is
// distinguishable from "never checked" and scoring can backfill the gaps
// (data-requests.ts findUnclassifiedExchanges). Shared by the turn route's
// background pass, the runner's synchronous ask-turn pass, and the score
// route's backfill. Call only with a successful classification — a failed one
// must leave no marker. Kept out of data-requests.ts so that module stays
// DB-free and unit-testable.
export async function logDataRequestClassification(params: {
  sessionId: string;
  phase: Phase;
  requests: DetectedDataRequest[];
  candidateTurnIndex: number;
  interviewerTurnIndex: number;
  revealedIds: Set<string>;
}): Promise<DataRequestEvent[]> {
  const events = toDataRequestEvents(params.requests, {
    candidateTurnIndex: params.candidateTurnIndex,
    interviewerTurnIndex: params.interviewerTurnIndex,
    revealedIds: params.revealedIds,
  });
  const marker = classifiedMarkerEvent({
    candidateTurnIndex: params.candidateTurnIndex,
    interviewerTurnIndex: params.interviewerTurnIndex,
    requestCount: events.length,
  });
  await db.insert(sessionEvents).values([...events, marker].map(e => ({
    sessionId: params.sessionId,
    category: e.category,
    subtype: e.subtype,
    turnIndex: e.turnIndex,
    phase: params.phase,
    payloadJsonb: e.payload,
  })));
  return events;
}
