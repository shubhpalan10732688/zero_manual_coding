'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { SESSION_COOKIE, destroySession } from '@core/auth/sessions';

import { readSessionToken } from './auth';

/** Ends the session in the database as well as in the browser, so it cannot be replayed. */
export async function signOutAction(): Promise<void> {
  const token = await readSessionToken();
  await destroySession(token);
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
