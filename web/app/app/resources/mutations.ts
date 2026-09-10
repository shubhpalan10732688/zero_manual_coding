'use server';

import { revalidatePath } from 'next/cache';

import { query } from '@core/db/pool';
import { loadIntegration } from '@core/integrations/store';

import { requireExtendedWorkspaceUser as requireUser } from '../lib/auth';
import { list, optionalText, text, url as parseUrl } from '../lib/forms';
import { toRepoSlug, RESOURCE_KINDS, type ResourceKind } from '../lib/resourceKinds';

import type { ResourceFormState } from './types';

/**
 * Adding to the resource shelf.
 *
 * GitHub links get a star count where the submitter has a GitHub token connected, because
 * "18k stars" is the fastest way for a reader to place an unfamiliar repository. It is a
 * nicety, not a requirement: the lookup is allowed to fail and the row is saved either way,
 * with stars left null rather than zero so the page can tell "never looked up" from "nobody
 * starred it".
 */

export async function addResourceAction(
  _previous: ResourceFormState,
  form: FormData,
): Promise<ResourceFormState> {
  const user = await requireUser();

  const title = text(form, 'title', 200);
  if (title.length < 3) {
    return { error: 'Give it a name people would recognise.', field: 'title' };
  }

  const url = parseUrl(form, 'url');
  if (!url) {
    return { error: 'A full http or https link is needed.', field: 'url' };
  }

  const requested = text(form, 'kind', 20) as ResourceKind;
  const kind = RESOURCE_KINDS.some((entry) => entry.id === requested) ? requested : 'repo';
  const repoSlug = toRepoSlug(url) ?? null;

  const existing = await query<{ id: string }>('SELECT id FROM resource WHERE url = $1', [url]);
  if (existing.length > 0) {
    return { error: 'That link is already on the shelf.', field: 'url' };
  }

  const stars = repoSlug ? await lookupStars(user.email, repoSlug) : null;

  await query(
    `INSERT INTO resource (title, url, kind, description, tags, repo_slug, repo_stars,
                           stars_at, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      title,
      url,
      kind,
      optionalText(form, 'description', 1000),
      list(form, 'tags'),
      repoSlug,
      stars,
      stars === null ? null : new Date(),
      user.email,
    ],
  );

  revalidatePath('/app/resources');
  return { added: title };
}

/**
 * Stars via the submitter's own token, which is also why this is best-effort: an unauthenticated
 * request would work for public repositories but shares one rate limit across the whole
 * deployment, and a private repository would fail regardless.
 */
async function lookupStars(email: string, slug: string): Promise<number | null> {
  const credential = await loadIntegration(email, 'github');
  if (!credential) return null;

  try {
    const response = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: {
        authorization: `Bearer ${credential.token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'zero-manual-coding',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as { stargazers_count?: number };
    return typeof payload.stargazers_count === 'number' ? payload.stargazers_count : null;
  } catch {
    return null;
  }
}

export async function voteResourceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  const removed = await query(
    'DELETE FROM resource_vote WHERE resource_id = $1 AND email = $2 RETURNING email',
    [id, user.email],
  );

  if (removed.length === 0) {
    await query(
      'INSERT INTO resource_vote (resource_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, user.email],
    );
  }

  revalidatePath('/app/resources');
}

/** Featuring is an admin call: it is the one thing that overrides how people voted. */
export async function featureResourceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user.isAdmin) return;

  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  await query('UPDATE resource SET featured = NOT featured WHERE id = $1', [id]);
  revalidatePath('/app/resources');
}
