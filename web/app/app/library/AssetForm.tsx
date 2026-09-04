'use client';

import { useActionState, useState } from 'react';

import { Alert, Checkbox, Field, FormActions, Select, TextArea, TextInput } from '../ui/Form';
import { Icon } from '../ui/Icons';
import type { AssetKind } from '../lib/library';

import { createAssetAction } from './mutations';
import type { AssetFormState } from './types';

/**
 * Authoring a command or a rule.
 *
 * One form for both, because they differ in two fields rather than in kind: a rule can be
 * scoped to a glob and can ask to always apply, a command cannot. The live filename preview
 * exists because the slug becomes both the URL and the file somebody is told to create, and
 * seeing it before saving avoids a library full of near-duplicate names.
 */

const COMMAND_EXAMPLE = `Review this diff for correctness and risk.

Check in order:
1. Does it do what the ticket asked?
2. What breaks if the input is empty, huge, or malformed?
3. Are the tests asserting behaviour or implementation?

Report findings as: file, line, what is wrong, what to do.`;

const RULE_EXAMPLE = `Prefer named exports; a default export only where a framework requires one.

Every new module gets a header comment explaining why it exists, not what it does.

Never introduce a dependency for something the standard library already does well.`;

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function AssetForm({
  kind,
  categories,
  defaultCategory,
}: {
  kind: AssetKind;
  categories: readonly string[];
  defaultCategory?: string;
}) {
  const [state, formAction, pending] = useActionState<AssetFormState, FormData>(
    createAssetAction,
    {},
  );
  const [title, setTitle] = useState('');

  const noun = kind === 'command' ? 'command' : 'rule';
  const slug = toSlug(title);
  const filename = kind === 'command'
    ? `.cursor/commands/${slug || 'your-command'}.md`
    : `.cursor/rules/${slug || 'your-rule'}.mdc`;

  return (
    <form className="ui-form" action={formAction}>
      <input type="hidden" name="kind" value={kind} />
      {state.error && <Alert tone="bad">{state.error}</Alert>}

      <div className="ui-form-grid">
        <Field
          label="Name"
          htmlFor="title"
          wide
          hint={
            <>
              What it does, in a few words. Saved as <code className="ui-code-inline">{filename}</code>
            </>
          }
        >
          <TextInput
            id="title"
            name="title"
            required
            maxLength={160}
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={state.field === 'title'}
            placeholder={kind === 'command' ? 'Review a diff for risk' : 'Module header comments'}
          />
        </Field>

        <Field label="Category" htmlFor="category" hint="How people will browse for it.">
          <Select id="category" name="category" defaultValue={defaultCategory ?? 'General'}>
            {categories.map((category) => (
              <option value={category} key={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Tags"
          htmlFor="tags"
          optional
          hint="Comma separated. Useful for the language or framework it assumes."
        >
          <TextInput id="tags" name="tags" placeholder="typescript, react" />
        </Field>

        <Field
          label="What it is for"
          htmlFor="description"
          wide
          optional
          hint="One or two sentences. This is what shows in the list, so it decides whether anyone opens it."
        >
          <TextArea id="description" name="description" rows={2} maxLength={400} />
        </Field>

        <Field
          label={kind === 'command' ? 'The prompt' : 'The rule'}
          htmlFor="body"
          wide
          hint={
            kind === 'command'
              ? 'Paste exactly what you type into Cursor. Concrete instructions and a stated output format travel far better than a vague one.'
              : 'Write it as an instruction, not a description. "Prefer X over Y" works; "we like X" does not.'
          }
        >
          <TextArea
            id="body"
            name="body"
            rows={14}
            required
            className="ui-mono"
            placeholder={kind === 'command' ? COMMAND_EXAMPLE : RULE_EXAMPLE}
            aria-invalid={state.field === 'body'}
          />
        </Field>

        {kind === 'rule' && (
          <>
            <Field
              label="Applies to"
              htmlFor="globPattern"
              optional
              hint="A glob, e.g. src/**/*.ts. Leave empty for a rule that is not tied to particular files."
            >
              <TextInput id="globPattern" name="globPattern" placeholder="src/**/*.ts" />
            </Field>

            <Field label="Always apply" hint="Whether Cursor should keep this in context for every conversation in the repository.">
              <Checkbox
                name="alwaysApply"
                label="Always in context"
                hint="Use sparingly: everything always applied competes for the same attention."
              />
            </Field>
          </>
        )}

        <Field label="Visibility" wide hint="Drafts are visible only to you until you publish them.">
          <Checkbox name="draft" label="Save as a draft" />
        </Field>
      </div>

      <FormActions hint={`Your name is attached, which is the point — people take the ${noun}s their colleagues vouched for.`}>
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="send" size={14} />
          {pending ? 'Saving…' : `Publish this ${noun}`}
        </button>
        <a className="ui-btn ui-btn-ghost" href={kind === 'command' ? '/app/commands' : '/app/rules'}>
          Cancel
        </a>
      </FormActions>
    </form>
  );
}
