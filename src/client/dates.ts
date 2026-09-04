export const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DateWindow {
  /** Inclusive start, always midnight UTC. */
  start: Date;
  /** Inclusive end, always 23:59:59.999 UTC. */
  end: Date;
}

export function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 0, 0, 0, 0),
  );
}

/**
 * Cursor treats endDate as inclusive, so a window must end at the last millisecond of
 * the day. Ending at the next midnight instead double-counts any event on the boundary.
 */
export function endOfUtcDayInclusive(value: Date): Date {
  return new Date(startOfUtcDay(value).getTime() + MS_PER_DAY - 1);
}

export function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * MS_PER_DAY);
}

export function formatDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Splits an inclusive date range into windows of at most `maxDays` whole days.
 * /teams/daily-usage-data rejects ranges longer than 30 days.
 */
export function chunkByDays(start: Date, end: Date, maxDays: number): DateWindow[] {
  if (maxDays < 1) throw new Error('maxDays must be at least 1');

  const rangeStart = startOfUtcDay(start);
  const rangeEnd = endOfUtcDayInclusive(end);
  if (rangeEnd.getTime() < rangeStart.getTime()) return [];

  const windows: DateWindow[] = [];
  let cursor = rangeStart;
  while (cursor.getTime() <= rangeEnd.getTime()) {
    const tentativeEnd = new Date(cursor.getTime() + maxDays * MS_PER_DAY - 1);
    const windowEnd = tentativeEnd.getTime() > rangeEnd.getTime() ? rangeEnd : tentativeEnd;
    windows.push({ start: cursor, end: windowEnd });
    cursor = new Date(windowEnd.getTime() + 1);
  }
  return windows;
}

/**
 * Accepts `YYYY-MM-DD`, a relative shortcut like `30d`, or epoch milliseconds.
 * Relative and bare-date inputs resolve to midnight UTC.
 */
export function parseDateInput(input: string, now: Date = new Date()): Date {
  const trimmed = input.trim();

  const relative = /^(\d+)d$/i.exec(trimmed);
  if (relative) {
    return startOfUtcDay(addDays(now, -Number(relative[1])));
  }
  if (trimmed.toLowerCase() === 'today') return startOfUtcDay(now);
  if (trimmed.toLowerCase() === 'yesterday') return startOfUtcDay(addDays(now, -1));

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000Z`);
  }
  if (/^\d+$/.test(trimmed)) {
    return new Date(Number(trimmed));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unrecognised date: ${input}`);
  }
  return parsed;
}
