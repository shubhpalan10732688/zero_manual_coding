'use server';

import { revalidatePath } from 'next/cache';

import { requireExtendedWorkspaceUser as requireUser } from '../lib/auth';
import { setActionStatus, type ActionStatus } from '../lib/recommendations';

const ALLOWED: ActionStatus[] = ['open', 'doing', 'done', 'dismissed'];

/**
 * Records what somebody decided about a recommendation.
 *
 * The recommendation itself is recomputed from the warehouse on every load, so this stores a
 * decision and nothing else. A key that no longer generates a recommendation simply stops
 * being read — there is no orphan to clean up.
 */
export async function setActionStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const key = String(formData.get('key') ?? '').trim();
  const status = String(formData.get('status') ?? '') as ActionStatus;
  if (!key || !ALLOWED.includes(status)) return;

  const note = String(formData.get('note') ?? '').trim();
  await setActionStatus(user.email, key, status, note || undefined);

  revalidatePath('/app/actions');
  revalidatePath('/app');
}
