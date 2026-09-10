'use server';

import { revalidatePath } from 'next/cache';

import { query } from '@core/db/pool';
import { refreshNews } from '@core/news/ingest';

import { requireExtendedWorkspaceUser as requireUser } from '../lib/auth';
import { list, optionalText, text, url as parseUrl } from '../lib/forms';

import type { NewsFormState } from './types';

/**
 * Writes to the news feed.
 *
 * Two ways in, deliberately. Feeds are pulled on a schedule by `npm run news`, which is the
 * normal path. Posting by hand is the fallback for a network that will not let a server reach
 * the open internet, and for the thing a colleague found that no feed carries. Both land in
 * the same table so the page does not have to be two pages.
 */

export async function postLinkAction(
  _previous: NewsFormState,
  form: FormData,
): Promise<NewsFormState> {
  const user = await requireUser();

  const title = text(form, 'title', 400);
  if (title.length < 6) return { error: 'A headline is needed.', field: 'title' };

  const url = parseUrl(form, 'url');
  if (!url) return { error: 'A full http or https link is needed.', field: 'url' };

  const existing = await query('SELECT 1 FROM news_item WHERE url = $1', [url]);
  if (existing.length > 0) return { error: 'That link is already in the feed.', field: 'url' };

  const tags = list(form, 'tags');

  await query(
    `INSERT INTO news_item (title, url, summary, tags, posted_by, published_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [title, url, optionalText(form, 'summary', 1000), tags.length > 0 ? tags : ['Curated'], user.email],
  );

  revalidatePath('/app/news');
  return { added: title };
}

/**
 * Pulls every enabled feed now.
 *
 * Admin-only and slow by nature — a handful of sequential HTTP requests to the open
 * internet. It exists so somebody can find out whether this deployment can reach the feeds at
 * all, which is the question the scheduled job cannot answer for you.
 */
export async function refreshNewsAction(): Promise<void> {
  const user = await requireUser();
  if (!user.isAdmin) return;

  await refreshNews();
  revalidatePath('/app/news');
}

export async function hideNewsItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  // Anyone can retract their own post; only an admin can hide what a feed produced.
  await query(
    `UPDATE news_item SET status = 'hidden'
     WHERE id = $1 AND (posted_by = $2 OR $3)`,
    [id, user.email, user.isAdmin],
  );

  revalidatePath('/app/news');
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user.isAdmin) return;

  const id = text(formData, 'id', 60);
  if (!id) return;

  await query('UPDATE news_source SET enabled = NOT enabled WHERE id = $1', [id]);
  revalidatePath('/app/news');
}
