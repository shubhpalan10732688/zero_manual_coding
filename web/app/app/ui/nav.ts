import { EXTENDED_WORKSPACE_ENABLED } from '../../../features';

import type { IconName } from './Icons';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Section heading rendered above this item. */
  group?: string;
  /** Open count, e.g. recommendations waiting on a decision. */
  count?: number;
}

/**
 * The workspace sidebar.
 *
 * Grouped rather than flat because the sections answer different questions. The first is
 * about your own work and comes from measurements; the second is what the organisation has
 * written down for itself; the third is plumbing. Mixing them made the concept sidebar read
 * like a list of nine unrelated pages.
 *
 * The first group disappears entirely for anyone signed in without a Cursor key. Those three
 * pages have no content at all without one, and a nav item that leads only to an explanation
 * of why it is empty is worse than no nav item: it reads as something broken rather than
 * something not switched on. Connections is where it gets switched on.
 */
export function workspaceNav(
  options: { actions?: number; hasCursorKey?: boolean } = {},
): NavItem[] {
  // Extended navigation is temporarily disabled, not deleted.
  if (!EXTENDED_WORKSPACE_ENABLED) {
    return [
      { href: '/app/board', label: 'Achievement board', icon: 'grid' },
      { href: '/', label: 'Public landing page', icon: 'external' },
    ];
  }
  const measured: NavItem[] = options.hasCursorKey
    ? [
        { href: '/app', label: 'Dashboard', icon: 'grid', group: 'Your work' },
        { href: '/app/impact', label: 'Impact', icon: 'target' },
        { href: '/app/actions', label: 'Actions', icon: 'bolt', count: options.actions },
      ]
    : [];

  return [
    ...measured,
    { href: '/app/board', label: 'Zero Manual Coding', icon: 'award', group: 'Shared' },
    { href: '/app/commands', label: 'Commands', icon: 'terminal' },
    { href: '/app/rules', label: 'Rules', icon: 'shield' },
    { href: '/app/resources', label: 'Resources', icon: 'book' },
    { href: '/app/news', label: 'AI News', icon: 'rss' },
    { href: '/app/connections', label: 'Connections', icon: 'plug', group: 'Account' },
  ];
}

export const periods = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: 'all', label: 'All', days: 3650 },
] as const;

export type PeriodId = (typeof periods)[number]['id'];

export function periodLabel(id: string): string {
  switch (id) {
    case '7d':
      return 'Last 7 days';
    case '90d':
      return 'Last 90 days';
    case 'all':
      return 'All time';
    default:
      return 'Last 30 days';
  }
}

export function periodDays(id: string): number {
  return periods.find((period) => period.id === id)?.days ?? 30;
}

/** Reads ?period= without trusting it, since it labels every number on the page. */
export function resolvePeriod(value: string | string[] | undefined): PeriodId {
  const first = Array.isArray(value) ? value[0] : value;
  const match = periods.find((period) => period.id === first);
  return match ? match.id : '30d';
}
