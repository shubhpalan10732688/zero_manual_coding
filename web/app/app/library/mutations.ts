'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { query } from '@core/db/pool';

import { requireExtendedWorkspaceUser as requireUser } from '../lib/auth';
import { checkbox, list, optionalText, text } from '../lib/forms';
import { categoriesFor, toSlug, type AssetKind } from '../lib/library';

import type { AssetFormState } from './types';

/**
 * Writes to the shared commands and rules library.
 *
 * Nothing here talks to Cursor. Cursor has no API for team rules or commands, so this is the
 * organisation's own catalogue and installing something from it is a copy-paste that happens
 * on the reader's machine. That is why the copy count exists: it is the only adoption signal
 * available, since we genuinely cannot see what anyone put in their .cursor directory.
 */

function kindFrom(form: FormData): AssetKind {
  return text(form, 'kind', 10) === 'rule' ? 'rule' : 'command';
}

export async function createAssetAction(
  _previous: AssetFormState,
  form: FormData,
): Promise<AssetFormState> {
  const user = await requireUser();
  const kind = kindFrom(form);
  const noun = kind === 'command' ? 'command' : 'rule';

  const title = text(form, 'title', 160);
  if (title.length < 4) {
    return { error: `Give the ${noun} a name someone browsing would understand.`, field: 'title' };
  }

  const body = text(form, 'body', 20000);
  if (body.length < 20) {
    return {
      error:
        kind === 'command'
          ? 'A command needs its actual prompt text. Paste what you type into Cursor.'
          : 'A rule needs the instruction itself, written the way you would tell a colleague.',
      field: 'body',
    };
  }

  const allowed = categoriesFor(kind);
  const requested = text(form, 'category', 40);
  const category = allowed.includes(requested) ? requested : 'General';

  const draft = checkbox(form, 'draft');
  const slug = await uniqueSlug(kind, toSlug(title) || `${noun}-${Date.now()}`);

  await query(
    `INSERT INTO shared_asset (kind, slug, title, description, body, category, tags,
                               glob_pattern, always_apply, author_email, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      kind,
      slug,
      title,
      optionalText(form, 'description', 400),
      body,
      category,
      list(form, 'tags'),
      kind === 'rule' ? optionalText(form, 'globPattern', 200) : null,
      kind === 'rule' && checkbox(form, 'alwaysApply'),
      user.email,
      draft ? 'draft' : 'published',
    ],
  );

  const base = kind === 'command' ? '/app/commands' : '/app/rules';
  revalidatePath(base);
  redirect(`${base}/${slug}?new=1`);
}

/**
 * Slugs are the URL and the suggested filename, so a second "Review checklist" cannot simply
 * overwrite the first. A numeric suffix is uglier than failing but far less annoying.
 */
async function uniqueSlug(kind: AssetKind, candidate: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? candidate : `${candidate}-${attempt + 1}`;
    const clash = await query('SELECT 1 FROM shared_asset WHERE kind = $1 AND slug = $2', [
      kind,
      slug,
    ]);
    if (clash.length === 0) return slug;
  }
  return `${candidate}-${Date.now()}`;
}

export async function voteAssetAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;

  const removed = await query(
    'DELETE FROM shared_asset_vote WHERE asset_id = $1 AND email = $2 RETURNING email',
    [id, user.email],
  );

  if (removed.length === 0) {
    await query(
      'INSERT INTO shared_asset_vote (asset_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, user.email],
    );
  }

  revalidatePath('/app/commands');
  revalidatePath('/app/rules');
}

/** Called after a successful clipboard write, which is the closest thing to an install. */
export async function recordCopyAction(id: number): Promise<void> {
  await requireUser();
  if (!Number.isFinite(id)) return;
  await query('UPDATE shared_asset SET copies = copies + 1 WHERE id = $1', [id]);
}

export async function setAssetStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = Number(formData.get('id'));
  const status = text(formData, 'status', 20);
  if (!Number.isFinite(id) || !['draft', 'published', 'archived'].includes(status)) return;

  await query(
    `UPDATE shared_asset SET status = $3, updated_at = now()
     WHERE id = $1 AND (author_email = $2 OR $4)`,
    [id, user.email, status, user.isAdmin],
  );

  revalidatePath('/app/commands');
  revalidatePath('/app/rules');
}
