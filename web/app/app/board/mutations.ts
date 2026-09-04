'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { query } from '@core/db/pool';

import { requireUser } from '../lib/auth';
import { checkbox, number, optionalText, text } from '../lib/forms';

import { LIKE_EMOJI, type BoardFormState } from './types';

/**
 * Writes to the Zero Manual Coding board.
 *
 * The savings figures are stored exactly as typed and never adjusted. They are the only
 * numbers in this product that no API can confirm, and quietly "normalising" somebody's
 * estimate would make them worse rather than better — every surface that shows them says who
 * wrote them instead.
 */

export async function createPostAction(
  _previous: BoardFormState,
  form: FormData,
): Promise<BoardFormState> {
  const user = await requireUser();

  const title = text(form, 'title', 200);
  if (title.length < 6) {
    return {
      error: 'Say what you achieved, in a line someone scrolling the wall would recognise.',
      field: 'title',
    };
  }

  const delivered = optionalText(form, 'delivered', 4000);
  if (!delivered) {
    return {
      error: 'Say how you achieved it with AI. That is the part colleagues read to decide whether it applies to their own work.',
      field: 'delivered',
    };
  }

  // Six columns named, and every other one left to its default: the date becomes today,
  // tickets and tags become empty arrays, the status becomes published. The team comes from
  // the author's profile rather than the form so the board can still group by it.
  const inserted = await query<{ id: string }>(
    `INSERT INTO achievement
       (author_email, title, delivered, effort_saved_pct, time_saved_days, team_name)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      user.email,
      title,
      delivered,
      number(form, 'effortSavedPct', { min: 0, max: 100 }),
      number(form, 'timeSavedDays', { min: 0, max: 999 }),
      user.teamName,
    ],
  );

  const id = inserted[0]!.id;

  revalidatePath('/app/board');
  revalidatePath('/app');
  redirect(`/app/board/${id}?new=1`);
}

/**
 * Toggles a like. Liking twice removes it.
 *
 * The stored value is the emoji column the table has always had, now only ever written with
 * LIKE_EMOJI. Keeping the column means a richer reaction set can come back without a schema
 * change; writing one value into it means the count on a card is a number that means one
 * thing, which the four-emoji version never managed.
 */
export async function likeAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  const existing = await query(
    'DELETE FROM achievement_reaction WHERE achievement_id = $1 AND email = $2 RETURNING emoji',
    [id, user.email],
  );

  if (existing.length === 0) {
    await query(
      `INSERT INTO achievement_reaction (achievement_id, email, emoji) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [id, user.email, LIKE_EMOJI],
    );
  }

  revalidatePath('/');
  revalidatePath('/app/board');
  revalidatePath(`/app/board/${id}`);
}

/** Hiding is the author's own call, and keeps the row so reactions are not orphaned. */
export async function hidePostAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  const hide = checkbox(formData, 'hide');
  await query(
    `UPDATE achievement SET status = $3, updated_at = now()
     WHERE id = $1 AND (author_email = $2 OR $4)`,
    [id, user.email, hide ? 'hidden' : 'published', user.isAdmin],
  );

  revalidatePath('/app/board');
  revalidatePath(`/app/board/${id}`);
}
