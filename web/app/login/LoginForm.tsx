'use client';

import { useActionState, useState } from 'react';

import { Alert, Field, TextInput } from '../app/ui/Form';
import { Icon } from '../app/ui/Icons';

import { LoginState, loginAction } from './actions';

const EMPTY: LoginState = {};

/**
 * `compact` is for the sign-in dialog on the landing page. The full-page version explains
 * what a key is for to somebody who arrived at a sign-in screen with no other context; in a
 * dialog, that same explanation buries the two boxes under a wall of text they already
 * decided to fill in.
 */
export function LoginForm({ next, compact = false }: { next?: string; compact?: boolean }) {
  const [state, submit, pending] = useActionState(loginAction, EMPTY);
  const [revealed, setRevealed] = useState(false);

  return (
    <form action={submit} className="ui-form">
      {next && <input type="hidden" name="next" value={next} />}
      {state.error && <Alert tone="bad">{state.error}</Alert>}

      {state.help === 'mismatch' && (
        <Alert tone="info">
          A key can only sign in as the account it was created on. Open{' '}
          <a href="https://cursor.com/dashboard" target="_blank" rel="noopener noreferrer">
            cursor.com/dashboard
          </a>{' '}
          while signed in as yourself and create a User API Key there.
        </Alert>
      )}

      <Field
        label="Work email"
        htmlFor="email"
        hint="The address on your Cursor account."
      >
        <TextInput
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          placeholder="you@company.com"
        />
      </Field>

      <Field
        label="Cursor API key — optional"
        htmlFor="apiKey"
        hint={
          compact ? (
            'Leave this blank. It only adds your own Cursor cost and delivery metrics, and you can add it later from Connections.'
          ) : (
            <>
              Leave this blank to go straight to the Zero Manual Coding wall, the shared
              commands and rules, the resources and the news. Add a key to also see your own
              Cloud Agent cost and shipped work. Create one at cursor.com/dashboard under{' '}
              <strong>Integrations &rarr; User API Keys</strong>; it starts with{' '}
              <code className="ui-code-inline">crsr_</code>. You can add or remove it later
              from Connections.
            </>
          )
        }
      >
        <TextInput
          id="apiKey"
          name="apiKey"
          type={revealed ? 'text' : 'password'}
          autoComplete="current-password"
          spellCheck={false}
          className="ui-mono"
          placeholder="crsr_… (optional)"
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

      <button type="submit" className="ui-btn ui-btn-primary ui-btn-block" disabled={pending}>
        {pending ? 'Checking with Cursor\u2026' : 'Sign in'}
        {!pending && <Icon name="arrowRight" size={14} />}
      </button>

      {!compact && (
        <p className="ui-hint">
          If you give a key it is encrypted before it is stored and is used only to read your
          own Cursor data. Signing in with one for the first time also pulls your Cloud Agent
          history, which can take a few seconds.
        </p>
      )}
    </form>
  );
}
