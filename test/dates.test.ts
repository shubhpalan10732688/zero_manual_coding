import {
  MS_PER_DAY,
  chunkByDays,
  endOfUtcDayInclusive,
  formatDay,
  parseDateInput,
  startOfUtcDay,
} from '../src/client/dates';

describe('endOfUtcDayInclusive', () => {
  it('lands on the last millisecond of the day', () => {
    const end = endOfUtcDayInclusive(new Date('2026-03-18T09:12:33.123Z'));
    expect(end.toISOString()).toBe('2026-03-18T23:59:59.999Z');
  });
});

describe('chunkByDays', () => {
  it('never exceeds the requested window length', () => {
    const windows = chunkByDays(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
      30,
    );

    for (const window of windows) {
      const days = (window.end.getTime() - window.start.getTime() + 1) / MS_PER_DAY;
      expect(days).toBeLessThanOrEqual(30);
    }
  });

  it('produces windows that abut without overlapping, so no event is counted twice', () => {
    const windows = chunkByDays(
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-02-15T00:00:00Z'),
      30,
    );

    expect(windows.length).toBe(2);
    for (let i = 1; i < windows.length; i += 1) {
      const previous = windows[i - 1]!;
      const current = windows[i]!;
      expect(current.start.getTime()).toBe(previous.end.getTime() + 1);
    }
  });

  it('covers the full range end to end', () => {
    const start = new Date('2026-01-01T00:00:00Z');
    const end = new Date('2026-03-31T00:00:00Z');
    const windows = chunkByDays(start, end, 30);

    expect(windows[0]!.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(windows[windows.length - 1]!.end.toISOString()).toBe('2026-03-31T23:59:59.999Z');
  });

  it('handles a single day', () => {
    const day = new Date('2026-05-04T13:00:00Z');
    const windows = chunkByDays(day, day, 30);
    expect(windows).toHaveLength(1);
    expect(formatDay(windows[0]!.start)).toBe('2026-05-04');
    expect(windows[0]!.end.toISOString()).toBe('2026-05-04T23:59:59.999Z');
  });

  it('returns nothing when the range is inverted', () => {
    expect(
      chunkByDays(new Date('2026-05-10T00:00:00Z'), new Date('2026-05-01T00:00:00Z'), 30),
    ).toEqual([]);
  });
});

describe('parseDateInput', () => {
  const now = new Date('2026-08-11T16:30:00Z');

  it.each([
    ['2026-07-01', '2026-07-01T00:00:00.000Z'],
    ['30d', '2026-07-12T00:00:00.000Z'],
    ['today', '2026-08-11T00:00:00.000Z'],
    ['yesterday', '2026-08-10T00:00:00.000Z'],
  ])('parses %s', (input, expected) => {
    expect(parseDateInput(input, now).toISOString()).toBe(expected);
  });

  it('accepts epoch milliseconds', () => {
    expect(parseDateInput('1710720000000').getTime()).toBe(1710720000000);
  });

  it('rejects nonsense', () => {
    expect(() => parseDateInput('not-a-date')).toThrow(/Unrecognised date/);
  });
});

describe('startOfUtcDay', () => {
  it('ignores local time zone offsets', () => {
    expect(startOfUtcDay(new Date('2026-08-11T23:45:00Z')).toISOString()).toBe(
      '2026-08-11T00:00:00.000Z',
    );
  });
});
