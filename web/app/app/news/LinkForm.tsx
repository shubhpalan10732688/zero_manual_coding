'use client';

import { useActionState } from 'react';

import { Alert, Field, FormActions, TextArea, TextInput } from '../ui/Form';
import { Icon } from '../ui/Icons';

import { postLinkAction } from './mutations';
import type { NewsFormState } from './types';

/** Posting a link by hand: the fallback when feeds are unreachable, and for what they miss. */
export function LinkForm() {
  const [state, formAction, pending] = useActionState<NewsFormState, FormData>(postLinkAction, {});

  return (
    <form className="ui-form" action={formAction}>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.added && <Alert tone="good">Posted “{state.added}”.</Alert>}

      <div className="ui-form-grid">
        <Field label="Headline" htmlFor="news-title" wide hint="What happened, in one line.">
          <TextInput
            id="news-title"
            name="title"
            required
            maxLength={400}
            aria-invalid={state.field === 'title'}
          />
        </Field>

        <Field label="Link" htmlFor="news-url" wide hint="Where to read it.">
          <TextInput
            id="news-url"
            name="url"
            type="url"
            required
            aria-invalid={state.field === 'url'}
            placeholder="https://"
          />
        </Field>

        <Field
          label="Why it matters here"
          htmlFor="news-summary"
          wide
          optional
          hint="A sentence on what it changes for us is worth more than the article's own abstract."
        >
          <TextArea id="news-summary" name="summary" rows={3} maxLength={1000} />
        </Field>

        <Field label="Tags" htmlFor="news-tags" wide optional hint="Comma separated, e.g. Cursor, Models.">
          <TextInput id="news-tags" name="tags" placeholder="Cursor, Models" />
        </Field>
      </div>

      <FormActions hint="Posted under your name, alongside what the feeds bring in.">
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="send" size={14} />
          {pending ? 'Posting…' : 'Post to the feed'}
        </button>
      </FormActions>
    </form>
  );
}
