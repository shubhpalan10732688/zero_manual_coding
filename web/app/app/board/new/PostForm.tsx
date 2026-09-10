'use client';

import { useActionState } from 'react';

import { Alert, Field, FormActions, TextArea, TextInput } from '../../ui/Form';
import { Icon } from '../../ui/Icons';
import { createPostAction } from '../mutations';
import type { BoardFormState } from '../types';

/**
 * The achievement form.
 *
 * Four fields, two of them optional. An earlier version asked for context, planning,
 * implementation, tickets, repository, collaborators and tags, and the honest reading of that
 * is a form people start and abandon: the write-up it produced was better, but a better
 * write-up nobody submits is worth nothing. What survives is the title, what was achieved,
 * and the two savings figures — those numbers have to exist as numbers or the board's totals
 * cannot be added up at all.
 *
 * It asks what you achieved rather than what shipped. The difference is not cosmetic: "what
 * shipped" invites a changelog entry and quietly excludes the migration nobody noticed, the
 * spike that saved a fortnight of the wrong work, and the test suite that stopped being a
 * bottleneck. Those are the posts this board is least likely to get and most needs.
 */
export function PostForm() {
  const [state, formAction, pending] = useActionState<BoardFormState, FormData>(
    createPostAction,
    {},
  );

  return (
    <form className="ui-form" action={formAction}>
      {state.error && <Alert tone="bad">{state.error}</Alert>}

      <div className="ui-form-grid">
        <Field
          label="What did you achieve?"
          htmlFor="title"
          wide
          hint="Be specific about the outcome. A clear title helps others find your story."
        >
          <TextInput
            id="title"
            name="title"
            required
            maxLength={200}
            autoFocus
            placeholder="e.g. Cut the reconciliation job from 40 minutes to 4"
            aria-invalid={state.field === 'title'}
          />
        </Field>

        <Field
          label="How did you achieve it with AI?"
          htmlFor="delivered"
          wide
          hint="Describe the problem, how you directed AI, and what you learned. Use bullet points to keep it easy to follow."
        >
          <TextArea
            id="delivered"
            name="delivered"
            rows={6}
            required
            placeholder={'- Asked for a plan first, then had it implement one step at a time\n- Gave it the failing test as the specification\n- Reviewed each change before moving on'}
            aria-invalid={state.field === 'delivered'}
          />
        </Field>

        <Field
          label="Effort saved (%)"
          htmlFor="effortSavedPct"
          optional
          hint="Your estimate compared with doing the same work by hand."
        >
          <TextInput
            id="effortSavedPct"
            name="effortSavedPct"
            type="number"
            min={0}
            max={100}
            step={5}
            placeholder="60"
          />
        </Field>

        <Field
          label="Time saved, in days"
          htmlFor="timeSavedDays"
          optional
          hint="Working days. Halves are fine — 0.5 is a useful number."
        >
          <TextInput
            id="timeSavedDays"
            name="timeSavedDays"
            type="number"
            min={0}
            max={999}
            step={0.5}
            placeholder="1.5"
          />
        </Field>
      </div>

      <FormActions
        hint="Achievements appear on the wall for everyone who can reach this site. You can hide your own afterwards."
      >
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="award" size={14} />
          {pending ? 'Sharing…' : 'Share this achievement'}
        </button>
        <a className="ui-btn ui-btn-ghost" href="/app/board">
          Cancel
        </a>
      </FormActions>
    </form>
  );
}
