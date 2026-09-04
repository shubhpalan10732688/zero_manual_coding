import { createHash } from 'node:crypto';

import { UsageEvent } from '../client/types';

/**
 * /teams/filtered-usage-events returns no event identifier, so re-fetching a trailing
 * window would duplicate rows. This hashes the fields that identify an event; combined
 * with ON CONFLICT DO NOTHING it makes ingestion idempotent.
 *
 * Two genuinely distinct events that share a millisecond, user, model, cost and token
 * counts will collapse into one row. That is rare and preferable to unbounded duplicates.
 */
export function eventKey(event: UsageEvent): string {
  const parts = [
    event.timestamp ?? '',
    event.userEmail ?? event.serviceAccountId ?? '',
    event.model ?? '',
    event.kind ?? '',
    String(event.chargedCents ?? ''),
    String(event.requestsCosts ?? ''),
    String(event.tokenUsage?.inputTokens ?? ''),
    String(event.tokenUsage?.outputTokens ?? ''),
    String(event.tokenUsage?.cacheReadTokens ?? ''),
    String(event.tokenUsage?.cacheWriteTokens ?? ''),
    event.conversationId ?? '',
  ];

  return createHash('sha256').update(parts.join('|')).digest('hex');
}
