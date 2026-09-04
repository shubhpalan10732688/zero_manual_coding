import { UsageEvent } from '../src/client/types';
import { eventKey } from '../src/ingest/eventKey';

const base: UsageEvent = {
  timestamp: '1750979225854',
  userEmail: 'developer@company.com',
  model: 'claude-4.5-sonnet',
  kind: 'Usage-based',
  maxMode: true,
  requestsCosts: 5,
  chargedCents: 21.36232,
  conversationId: '8f2e4a1b-6c3d-4e5f-9a7b-2d1c8e6f4a3b',
  tokenUsage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 10, cacheWriteTokens: 5 },
};

describe('eventKey', () => {
  it('is stable across re-fetches of the same event', () => {
    expect(eventKey(base)).toBe(eventKey({ ...base }));
  });

  it('ignores fields that carry no identity', () => {
    // isHeadless and cursorTokenFee are derived from the same underlying event.
    expect(eventKey({ ...base, isHeadless: true, cursorTokenFee: 1.18 })).toBe(eventKey(base));
  });

  it.each([
    ['timestamp', { timestamp: '1750979225855' }],
    ['user', { userEmail: 'other@company.com' }],
    ['model', { model: 'gpt-5' }],
    ['cost', { chargedCents: 99 }],
    ['conversation', { conversationId: 'different' }],
    ['input tokens', { tokenUsage: { ...base.tokenUsage, inputTokens: 1201 } }],
  ])('changes when %s differs', (_label, patch) => {
    expect(eventKey({ ...base, ...(patch as Partial<UsageEvent>) })).not.toBe(eventKey(base));
  });

  it('keys service-account events that carry no user email', () => {
    const { userEmail: _omitted, ...withoutEmail } = base;
    const key = eventKey({ ...withoutEmail, serviceAccountId: 'sa_abc123' });
    expect(key).toHaveLength(64);
    expect(key).not.toBe(eventKey(base));
  });
});
