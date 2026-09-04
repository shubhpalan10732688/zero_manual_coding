/**
 * Formatting for the workspace. Forked from the concept UI's helpers and extended with the
 * things user-written content needs: dates people wrote down, initials for an avatar, and
 * durations spoken the way a person would say them.
 */

import type { Confidence, Priority } from './types';

export function money(cents: number, options: { compact?: boolean; cents?: boolean } = {}): string {
  const amount = cents / 100;
  if (options.compact && Math.abs(amount) >= 1000) {
    const thousands = amount / 1000;
    return `$${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1)}k`;
  }
  if (options.cents === false) return `$${Math.round(amount).toLocaleString('en-US')}`;
  if (Math.abs(amount) >= 1000) {
    return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${amount.toFixed(2)}`;
}

export function count(value: number): string {
  return value.toLocaleString('en-US');
}

export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function percent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

export function signedPercent(value: number, digits = 0): string {
  const rendered = `${(Math.abs(value) * 100).toFixed(digits)}%`;
  if (value === 0) return rendered;
  return `${value > 0 ? '+' : '-'}${rendered}`;
}

export function hours(value: number): string {
  return value >= 10 ? `${Math.round(value)} hrs` : `${value.toFixed(1)} hrs`;
}

/** Days as somebody would write them: 0.5, 1, 2.5, 12. */
export function days(value: number): string {
  if (value >= 10) return String(Math.round(value));
  const rounded = Math.round(value * 2) / 2;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function plural(value: number, one: string, many = `${one}s`): string {
  return value === 1 ? one : many;
}

export function score(value: number): string {
  return `${Math.round(value)}`;
}

export function scoreLabel(value: number): string {
  if (value >= 90) return 'Excellent';
  if (value >= 80) return 'Strong';
  if (value >= 70) return 'Fair';
  if (value >= 60) return 'Needs work';
  return 'At risk';
}

export function scoreTone(value: number): 'good' | 'warn' | 'bad' {
  if (value >= 80) return 'good';
  if (value >= 68) return 'warn';
  return 'bad';
}

export const priorityLabel: Record<Priority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  optimization: 'Optimization',
};

export const priorityTone: Record<Priority, 'bad' | 'warn' | 'blue' | 'good'> = {
  critical: 'bad',
  high: 'warn',
  medium: 'blue',
  optimization: 'good',
};

export const confidenceLabel: Record<Confidence, string> = {
  measured: 'Measured',
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Self-reported',
};

export const confidenceNote: Record<Confidence, string> = {
  measured: 'Read directly from the Cursor, GitHub or Jira API.',
  high: 'Inferred from explicit links such as a ticket key in a branch name.',
  medium: 'Inferred from correlation; some activity may be unattributed.',
  low: 'Written by the person who did the work. Not verified against any system.',
};

export function statusTone(status: string): 'good' | 'warn' | 'blue' | 'neutral' {
  switch (status) {
    case 'merged':
    case 'done':
    case 'published':
    case 'active':
      return 'good';
    case 'doing':
    case 'in review':
    case 'review':
      return 'warn';
    case 'open':
      return 'blue';
    default:
      return 'neutral';
  }
}

/**
 * A date the way it reads in a feed. Recent things are relative because "3 days ago" is
 * what someone actually wants to know; older things get a real date, because "94 days ago"
 * is arithmetic nobody asked for.
 */
export function when(value: Date | string | null | undefined, now = new Date()): string {
  if (!value) return 'unknown';
  const date = typeof value === 'string' ? parseDay(value) : value;
  if (!date || Number.isNaN(date.getTime())) return 'unknown';

  const elapsed = now.getTime() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (elapsed < 0) return formatDay(date);
  if (elapsed < 60 * 1000) return 'just now';
  if (elapsed < 60 * 60 * 1000) {
    const minutes = Math.floor(elapsed / 60_000);
    return `${minutes} ${plural(minutes, 'minute')} ago`;
  }
  if (elapsed < dayMs) {
    const value = Math.floor(elapsed / (60 * 60 * 1000));
    return `${value} ${plural(value, 'hour')} ago`;
  }
  if (elapsed < 7 * dayMs) {
    const value = Math.floor(elapsed / dayMs);
    return value === 1 ? 'yesterday' : `${value} days ago`;
  }
  if (elapsed < 30 * dayMs) {
    const value = Math.floor(elapsed / (7 * dayMs));
    return `${value} ${plural(value, 'week')} ago`;
  }
  return formatDay(date);
}

/** Postgres dates arrive as YYYY-MM-DD, which new Date() reads as UTC midnight. */
function parseDay(value: string): Date | undefined {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00Z`);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function formatDay(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? parseDay(value) : value;
  if (!date) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  const source = (name ?? '').trim();
  if (!source) return fallback;
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** A repository or ticket reference shown without its boilerplate. */
export function shortRepo(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^(https?:\/\/)?(www\.)?(github\.com|gitlab\.com)\//, '').replace(/\.git$/, '');
}

export function durationFromMs(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '—';
  const minutes = ms / 60_000;
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${Math.round(minutes)}m`;
  return `${(minutes / 60).toFixed(1)}h`;
}
