import {
  checkbox,
  day,
  list,
  number,
  optionalText,
  text,
  url,
} from '../web/app/app/lib/forms';

/**
 * Form reading, which is where every write into the workspace begins.
 *
 * These helpers are the only place that decides what a blank box means, and getting that
 * wrong is not a rendering bug: a zero stored for "days saved" becomes part of a total the
 * organisation reports. The cases below are mostly about absence, coercion and the two
 * fields a person could use to attack someone else — a link and a ticket key.
 */

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.append(name, value);
  return data;
}

describe('text', () => {
  it('trims surrounding whitespace', () => {
    expect(text(form({ title: '  Config viewer  ' }), 'title')).toBe('Config viewer');
  });

  it('returns empty string for a field that was never submitted', () => {
    expect(text(form({}), 'title')).toBe('');
  });

  it('truncates to the column width rather than letting the insert fail', () => {
    expect(text(form({ title: 'x'.repeat(50) }), 'title', 10)).toHaveLength(10);
  });
});

describe('optionalText', () => {
  it('turns a blank box into null, not an empty string', () => {
    expect(optionalText(form({ note: '   ' }), 'note')).toBeNull();
  });

  it('keeps text that was actually typed', () => {
    expect(optionalText(form({ note: 'hi' }), 'note')).toBe('hi');
  });
});

describe('list', () => {
  it('splits on commas and newlines alike, since people use both', () => {
    expect(list(form({ tags: 'one, two\nthree' }), 'tags')).toEqual(['one', 'two', 'three']);
  });

  it('drops empty entries left by trailing separators', () => {
    expect(list(form({ tags: 'one,,two,' }), 'tags')).toEqual(['one', 'two']);
  });

  it('deduplicates case-insensitively but keeps the first spelling', () => {
    expect(list(form({ tags: 'Frontend, frontend, FRONTEND' }), 'tags')).toEqual(['Frontend']);
  });

  it('uppercases ticket keys so filters match regardless of how they were typed', () => {
    expect(list(form({ tickets: 'vcap-1192, VCAP-1177' }), 'tickets', { upper: true })).toEqual([
      'VCAP-1192',
      'VCAP-1177',
    ]);
  });

  it('deduplicates ticket keys that differ only in case', () => {
    expect(list(form({ tickets: 'vcap-1192, VCAP-1192' }), 'tickets', { upper: true })).toEqual([
      'VCAP-1192',
    ]);
  });

  it('caps the number of entries', () => {
    const tags = Array.from({ length: 30 }, (_, i) => `tag${i}`).join(',');
    expect(list(form({ tags }), 'tags')).toHaveLength(12);
  });

  it('returns an empty array for a blank field', () => {
    expect(list(form({ tags: '  ' }), 'tags')).toEqual([]);
  });
});

describe('number', () => {
  it('returns null for a blank field, so "not measured" survives into the database', () => {
    expect(number(form({ days: '' }), 'days')).toBeNull();
  });

  it('reads a decimal', () => {
    expect(number(form({ days: '2.5' }), 'days')).toBe(2.5);
  });

  it('strips units someone typed alongside the figure', () => {
    expect(number(form({ pct: '65%' }), 'pct')).toBe(65);
    expect(number(form({ days: '3 days' }), 'days')).toBe(3);
  });

  it('clamps to the bounds instead of rejecting, since the intent is clear', () => {
    expect(number(form({ pct: '150' }), 'pct', { min: 0, max: 100 })).toBe(100);
    expect(number(form({ pct: '-20' }), 'pct', { min: 0, max: 100 })).toBe(0);
  });

  it('returns null when nothing numeric remains after stripping', () => {
    expect(number(form({ days: 'lots' }), 'days')).toBeNull();
  });
});

describe('checkbox', () => {
  it('is true only for a checked box', () => {
    expect(checkbox(form({ always: 'on' }), 'always')).toBe(true);
  });

  it('is false when the box was absent, which is how browsers report unchecked', () => {
    expect(checkbox(form({}), 'always')).toBe(false);
  });
});

describe('day', () => {
  const today = new Date('2026-03-15T09:00:00Z');

  it('accepts a past date as typed', () => {
    expect(day(form({ happened: '2026-03-01' }), 'happened', today)).toBe('2026-03-01');
  });

  it('pulls a future date back to today, because work cannot be delivered tomorrow', () => {
    expect(day(form({ happened: '2027-01-01' }), 'happened', today)).toBe('2026-03-15');
  });

  it('falls back to today when the field is blank or malformed', () => {
    expect(day(form({ happened: '' }), 'happened', today)).toBe('2026-03-15');
    expect(day(form({ happened: '15/03/2026' }), 'happened', today)).toBe('2026-03-15');
  });
});

describe('url', () => {
  it('keeps an https link', () => {
    expect(url(form({ pr: 'https://github.com/corp/ui/pull/482' }), 'pr')).toBe(
      'https://github.com/corp/ui/pull/482',
    );
  });

  it('rejects a javascript: URL, which would otherwise render as a working link', () => {
    expect(url(form({ pr: 'javascript:alert(1)' }), 'pr')).toBeNull();
  });

  it('rejects other non-web schemes', () => {
    expect(url(form({ pr: 'data:text/html,<script>' }), 'pr')).toBeNull();
    expect(url(form({ pr: 'file:///etc/passwd' }), 'pr')).toBeNull();
  });

  it('rejects text that is not a URL at all', () => {
    expect(url(form({ pr: 'github.com/corp/ui' }), 'pr')).toBeNull();
  });

  it('returns null for a blank field', () => {
    expect(url(form({ pr: '   ' }), 'pr')).toBeNull();
  });
});
