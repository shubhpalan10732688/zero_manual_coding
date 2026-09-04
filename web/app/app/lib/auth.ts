import { cache } from 'react';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, resolveSession } from '@core/auth/sessions';
import { query } from '@core/db/pool';

/**
 * Who is signed in, for every page under /app.
 *
 * The older pages accept an identity asserted by an SSO proxy header. This tree does not:
 * it only trusts a session token it issued itself, after Cursor confirmed the key belonged
 * to the address typed alongside it. That is a deliberate narrowing. A header can be forged
 * by anything sitting between the browser and the app, and these pages let people write
 * content under their own name.
 *
 * cache() scopes to one request, so a page rendering a shell, a header and three panels
 * resolves the session once.
 */

export interface AppUser {
  email: string;
  name: string;
  initials: string;
  teamName: string | null;
  jobTitle: string | null;
  isAdmin: boolean;
  lastLoginAt: Date | null;
}

function toInitials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s.@_-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

function isAdminEmail(email: string): boolean {
  const allowlist = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export const readSessionToken = cache(async (): Promise<string | undefined> => {
  return (await cookies()).get(SESSION_COOKIE)?.value;
});

export const currentUser = cache(async (): Promise<AppUser | null> => {
  const email = await resolveSession(await readSessionToken());
  if (!email) return null;

  const rows = await query<{
    email: string;
    first_name: string | null;
    last_name: string | null;
    team_name: string | null;
    job_title: string | null;
    last_login_at: Date | null;
    member_name: string | null;
    member_role: string | null;
  }>(
    `SELECT u.email, u.first_name, u.last_name, u.team_name, u.job_title, u.last_login_at,
            m.name AS member_name, m.role AS member_role
     FROM app_user u
     LEFT JOIN cursor_member m ON lower(m.email) = lower(u.email)
     WHERE u.email = $1`,
    [email],
  );

  const row = rows[0];
  if (!row) return null;

  const name =
    [row.first_name, row.last_name].filter(Boolean).join(' ') || row.member_name || row.email;

  return {
    email: row.email,
    name,
    initials: toInitials(name, row.email),
    teamName: row.team_name,
    jobTitle: row.job_title,
    isAdmin:
      isAdminEmail(row.email) ||
      row.member_role === 'owner' ||
      row.member_role === 'free-owner',
    lastLoginAt: row.last_login_at,
  };
});

export async function requireUser(): Promise<AppUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}

export async function currentUserAgent(): Promise<string | undefined> {
  return (await headers()).get('user-agent') ?? undefined;
}
