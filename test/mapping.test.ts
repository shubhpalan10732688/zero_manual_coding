import { DailyUsageRow, UsageEvent } from '../src/client/types';
import { toRow as dailyUsageRow } from '../src/ingest/dailyUsage';
import { toRow as usageEventRow } from '../src/ingest/usageEvents';

describe('daily usage mapping', () => {
  const row: DailyUsageRow = {
    userId: 12345,
    day: '2026-03-18',
    date: 1710720000000,
    email: 'developer@company.com',
    isActive: true,
    totalLinesAdded: 1543,
    totalLinesDeleted: 892,
    acceptedLinesAdded: 1102,
    acceptedLinesDeleted: 645,
    totalApplies: 87,
    totalAccepts: 73,
    totalRejects: 14,
    totalTabsShown: 342,
    totalTabsAccepted: 289,
    composerRequests: 45,
    chatRequests: 128,
    agentRequests: 12,
    cmdkUsages: 67,
    mostUsedModel: 'claude-4.5-sonnet',
    applyMostUsedExtension: 'ts',
    tabMostUsedExtension: 'ts',
    clientVersion: '1.5.2',
  };

  it('maps email and day into the composite key positions', () => {
    const mapped = dailyUsageRow(row);
    expect(mapped[0]).toBe('developer@company.com');
    expect(mapped[1]).toBe('2026-03-18');
  });

  it('treats a missing isActive as inactive, so unpaginated responses cannot inflate adoption', () => {
    const { isActive: _omitted, ...withoutFlag } = row;
    expect(dailyUsageRow(withoutFlag as DailyUsageRow)[3]).toBe(false);
  });

  it('defaults absent counters to zero rather than null', () => {
    const sparse = { email: 'a@x.com', day: '2026-03-18' } as DailyUsageRow;
    const mapped = dailyUsageRow(sparse);
    expect(mapped.slice(4, 18).every((value) => value === 0)).toBe(true);
  });
});

describe('usage event mapping', () => {
  const event: UsageEvent = {
    timestamp: '1750979225854',
    userEmail: 'developer@company.com',
    model: 'claude-4.5-sonnet',
    kind: 'Usage-based',
    maxMode: true,
    isHeadless: false,
    isChargeable: true,
    isTokenBasedCall: true,
    requestsCosts: 5,
    chargedCents: 21.36232,
    cursorTokenFee: 1.18,
    conversationId: 'conv-1',
    tokenUsage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 10, cacheWriteTokens: 5 },
  };

  it('converts the string epoch timestamp into a Date', () => {
    const mapped = usageEventRow(event);
    expect(mapped[1]).toBeInstanceOf(Date);
    expect((mapped[1] as Date).getTime()).toBe(1750979225854);
  });

  it('starts each row with the synthetic event key', () => {
    expect(String(usageEventRow(event)[0])).toHaveLength(64);
  });

  it('flattens tokenUsage and defaults chargedCents to zero when absent', () => {
    const { tokenUsage: _t, chargedCents: _c, ...bare } = event;
    const mapped = usageEventRow(bare as UsageEvent);
    expect(mapped[10]).toBe(0);
    expect(mapped.slice(12, 16)).toEqual([null, null, null, null]);
  });
});
