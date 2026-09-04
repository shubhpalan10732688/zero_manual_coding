'use client';

import { useActionState, useState } from 'react';

import { Alert, Field, FormActions, TextInput } from '../ui/Form';
import { Icon } from '../ui/Icons';

import { connectCursorAction, connectGitHubAction, connectJiraAction } from './mutations';
import type { ConnectFormState } from './types';

/**
 * The three credential forms.
 *
 * Each one says what the token is for and what the minimum access is, because the honest
 * answer to "what scopes does this need" is short and asking for more than that is how a
 * dashboard ends up holding write access to everything.
 */

export function CursorKeyForm({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState<ConnectFormState, FormData>(
    connectCursorAction,
    {},
  );
  const [revealed, setRevealed] = useState(false);

  return (
    <form className="ui-form" action={formAction}>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.connected && (
        <Alert tone="good">
          Key stored. Your Dashboard, Impact and Actions pages are now in the sidebar.
        </Alert>
      )}

      <Field
        label="Cursor User API Key"
        htmlFor="cursor-key"
        hint={
          <>
            Create one at cursor.com/dashboard under{' '}
            <strong>Integrations &rarr; User API Keys</strong>. It starts with{' '}
            <code className="ui-code-inline">crsr_</code> and must belong to the account you
            signed in as — a key from another account is refused.
          </>
        }
      >
        <TextInput
          id="cursor-key"
          name="apiKey"
          type={revealed ? 'text' : 'password'}
          required
          autoComplete="off"
          spellCheck={false}
          className="ui-mono"
          placeholder="crsr_…"
          aria-invalid={state.field === 'apiKey'}
        />
      </Field>

      <label className="ui-check">
        <input
          type="checkbox"
          checked={revealed}
          onChange={(event) => setRevealed(event.target.checked)}
        />
        <span>Show the key so I can check I pasted all of it</span>
      </label>

      <FormActions hint="Stored encrypted and used only to read your own Cloud Agent history. Connecting also pulls that history, which can take a few seconds.">
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="sparkle" size={14} />
          {pending ? 'Checking with Cursor…' : connected ? 'Replace key' : 'Connect Cursor'}
        </button>
        <a
          className="ui-btn ui-btn-ghost"
          href="https://cursor.com/dashboard?tab=integrations"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create one
          <Icon name="external" size={12} />
        </a>
      </FormActions>
    </form>
  );
}

export function GitHubForm({ connected }: { connected: boolean }) {
  const [state, formAction, pending] = useActionState<ConnectFormState, FormData>(
    connectGitHubAction,
    {},
  );

  return (
    <form className="ui-form" action={formAction}>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.connected && <Alert tone="good">Connected as {state.connected}.</Alert>}

      <Field
        label="Personal access token"
        htmlFor="github-token"
        hint={
          <>
            A fine-grained token with <b>read-only</b> access to the repositories your agents
            work in — Contents and Pull requests. A classic token needs only{' '}
            <code className="ui-code-inline">repo:status</code> and{' '}
            <code className="ui-code-inline">public_repo</code> for public work. Nothing here
            ever writes to GitHub.
          </>
        }
      >
        <TextInput
          id="github-token"
          name="token"
          type="password"
          required
          autoComplete="off"
          spellCheck={false}
          className="ui-mono"
          placeholder="github_pat_… or ghp_…"
          aria-invalid={state.field === 'token'}
        />
      </Field>

      <FormActions hint="Stored encrypted, used only to read the pull requests your own agents opened.">
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="github" size={14} />
          {pending ? 'Checking…' : connected ? 'Replace token' : 'Connect GitHub'}
        </button>
        <a
          className="ui-btn ui-btn-ghost"
          href="https://github.com/settings/personal-access-tokens"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create one
          <Icon name="external" size={12} />
        </a>
      </FormActions>
    </form>
  );
}

export function JiraForm({
  connected,
  defaultSite,
  defaultEmail,
}: {
  connected: boolean;
  defaultSite?: string;
  defaultEmail: string;
}) {
  const [state, formAction, pending] = useActionState<ConnectFormState, FormData>(
    connectJiraAction,
    {},
  );

  return (
    <form className="ui-form" action={formAction}>
      {state.error && <Alert tone="bad">{state.error}</Alert>}
      {state.connected && <Alert tone="good">Connected as {state.connected}.</Alert>}

      <div className="ui-form-grid">
        <Field label="Jira site" htmlFor="jira-site" hint="e.g. acme.atlassian.net">
          <TextInput
            id="jira-site"
            name="site"
            required
            defaultValue={defaultSite ?? ''}
            placeholder="acme.atlassian.net"
            aria-invalid={state.field === 'site'}
          />
        </Field>

        <Field
          label="Atlassian account email"
          htmlFor="jira-email"
          hint="The account the token was created on. Usually the same address you signed in with here."
        >
          <TextInput id="jira-email" name="accountEmail" type="email" defaultValue={defaultEmail} />
        </Field>

        <Field
          label="API token"
          htmlFor="jira-token"
          wide
          hint="An Atlassian API token. Its access is whatever your own account can already read, so it grants nothing new."
        >
          <TextInput
            id="jira-token"
            name="token"
            type="password"
            required
            autoComplete="off"
            spellCheck={false}
            className="ui-mono"
            aria-invalid={state.field === 'token'}
          />
        </Field>
      </div>

      <FormActions hint="Used to read the type, status and summary of tickets your agents worked on.">
        <button type="submit" className="ui-btn ui-btn-primary" disabled={pending}>
          <Icon name="ticket" size={14} />
          {pending ? 'Checking…' : connected ? 'Replace token' : 'Connect Jira'}
        </button>
        <a
          className="ui-btn ui-btn-ghost"
          href="https://id.atlassian.com/manage-profile/security/api-tokens"
          target="_blank"
          rel="noopener noreferrer"
        >
          Create one
          <Icon name="external" size={12} />
        </a>
      </FormActions>
    </form>
  );
}
