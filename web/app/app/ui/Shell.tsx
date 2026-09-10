import type { ReactNode } from 'react';
import Link from 'next/link';

import { EXTENDED_WORKSPACE_ENABLED } from '../../../features';

import { signOutAction } from '../lib/actions';

import { BrandMark, Icon } from './Icons';
import { PeriodSelector } from './PeriodSelector';
import { SidebarNav } from './SidebarNav';
import type { NavItem } from './nav';
import { periodLabel } from './nav';

export interface ShellUser {
  name: string;
  email: string;
  initials: string;
  role?: string | null;
  isAdmin?: boolean;
}

export interface ShellConnection {
  state: 'on' | 'off' | 'error';
  label: string;
  detail: string;
}

/**
 * The frame every workspace page renders. Pages render it themselves rather than it living
 * in the layout, because a layout cannot read searchParams and the period selector has to
 * reflect ?period=.
 *
 * The sidebar foot states which of the three systems are actually connected. That belongs
 * in the chrome and not on one settings page: half of what the dashboard can tell you
 * depends on it, so it should be visible while you are reading the numbers.
 */
export function Shell({
  user,
  nav,
  title,
  subtitle,
  period,
  showPeriod = false,
  headerExtra,
  connection,
  children,
}: {
  user: ShellUser;
  nav: NavItem[];
  title: string;
  subtitle?: string;
  period?: string;
  showPeriod?: boolean;
  headerExtra?: ReactNode;
  connection: ShellConnection;
  children: ReactNode;
}) {
  // Whatever is first in the sidebar is this reader's home. For most people that is the
  // dashboard; for anyone without a Cursor key the dashboard is not in the nav at all, and
  // sending them to a page that only redirects makes the brand feel broken.
  const home = nav[0]?.href ?? '/app';

  return (
    <div className="ui-app">
      <a className="ui-skip-link" href="#workspace-content">Skip to content</a>
      <aside className="ui-sidebar">
        <Link className="ui-brand" href={home}>
          <span className="ui-brand-mark">
            <BrandMark />
          </span>
          <span>
            <span className="ui-brand-wordmark">Zero Manual<span>Coding</span></span>
            <span className="ui-brand-scope">The community workspace</span>
          </span>
        </Link>

        <div className="ui-sidebar-label">Workspace</div>
        <SidebarNav items={nav} root="/app" />

        <div className="ui-sidebar-foot">
          {/* Connection status is retained for a future extended-workspace release. */}
          {EXTENDED_WORKSPACE_ENABLED && <a className={`ui-conn ui-status-${connection.state}`} href="/app/connections">
            <span className="ui-status-dot" />
            <span>
              {connection.label}
              <br />
              <span style={{ color: 'var(--ui-text-faint)', fontSize: 10.5 }}>
                {connection.detail}
              </span>
            </span>
          </a>}
          <div className="ui-sidebar-account">
            <span className="ui-avatar">{user.initials}</span>
            <span><strong>{user.name}</strong><small>{user.isAdmin ? 'Workspace administrator' : 'Community member'}</small></span>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="ui-signout">
              <Icon name="logout" size={15} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="ui-main">
        <header className="ui-topbar">
          <div className="ui-topbar-title">
            <span className="ui-topbar-eyebrow">Workspace / {user.isAdmin ? 'Administration' : 'Community'}</span>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <div className="ui-topbar-tools">
            {headerExtra}
            {showPeriod && <PeriodSelector active={period ?? '30d'} />}
            <div className="ui-user" title={user.email}>
              <span className="ui-avatar">{user.initials}</span>
              <span>
                <span className="ui-user-name">{user.name}</span>
                <br />
                <span className="ui-user-role">{user.role ?? user.email}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="ui-content" id="workspace-content" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

/** Restates the period next to figures that would otherwise be undated. */
export function PeriodNote({ period, extra }: { period: string; extra?: string }) {
  return (
    <span className="ui-card-note">
      {periodLabel(period)}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}
