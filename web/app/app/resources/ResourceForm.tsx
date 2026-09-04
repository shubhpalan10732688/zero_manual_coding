'use client';

import { useActionState } from 'react';

import { Alert, Field, FormActions, Select, TextArea, TextInput } from '../ui/Form';
import { Icon } from '../ui/Icons';
import { RESOURCE_KINDS } from '../lib/resourceKinds';

import { addResourceAction } from './mutations';
import type { ResourceFormState } from './types';

/** Adding something to the shelf. Deliberately four fields: a longer form gets fewer links. */
export function ResourceForm({ hasGitHub }: { hasGitHub: boolean }) {
  const [state, formAction, pending] = useActionState<ResourceFormState, FormData>(
    addResourceAction,
    {},
  );

  return (
    <form className="ui-form" action={formAction}>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.added && <Alert tone="good">Added “{state.added}” to the shelf.</Alert>}

      <div className="ui-form-grid">
        <Field label="Name" htmlFor="resource-title" hint="How people will recognise it.">
          <TextInput
            id="resource-title"
            name="title"
            required
            maxLength={200}
            aria-invalid={state.field === 'title'}
            placeholder="Graphify"
          />
        </Field>

        <Field label="Kind" htmlFor="resource-kind" hint="Used to filter the shelf.">
          <Select id="resource-kind" name="kind" defaultValue="repo">
            {RESOURCE_KINDS.map((kind) => (
              <option value={kind.id} key={kind.id}>
                {kind.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Link"
          htmlFor="resource-url"
          wide
          hint={
            hasGitHub
              ? 'A GitHub link also picks up its star count, using the token you connected.'
              : 'GitHub links show a star count once you connect a GitHub token on the Connections page.'
          }
        >
          <TextInput
            id="resource-url"
            name="url"
            type="url"
            required
            aria-invalid={state.field === 'url'}
            placeholder="https://github.com/owner/name"
          />
        </Field>

        <Field
          label="Why it is worth someone's time"
          htmlFor="resource-description"
          wide
          optional
          hint="The part that decides whether a colleague clicks. What did it help you do?"
        >
          <TextArea id="resource-description" name="description" rows={3} maxLength={1000} />
        </Field>

        <Field
          label="Tags"
          htmlFor="resource-tags"
          wide
          optional
          hint="Comma separated, e.g. agents, evals, typescript."
        >
          <TextInput id="resource-tags" name="tags" placeholder="agents, evals" />
        </Field>
      </div>

      <FormActions hint="Your name is attached to the submission.">
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="plus" size={14} />
          {pending ? 'Adding…' : 'Add to the shelf'}
        </button>
      </FormActions>
    </form>
  );
}
