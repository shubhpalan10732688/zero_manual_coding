import { inferCursorConnectors } from '@core/integrations/cursorConnectors';

import { Card, KeyValues, Note } from '../ui/Card';
import { Icon } from '../ui/Icons';
import { Shell } from '../ui/Shell';
import { Tag } from '../ui/Tag';
import { formatDay, when } from '../ui/format';
import { shellContext } from '../lib/shell';

import { CursorKeyForm, GitHubForm, JiraForm } from './ConnectForms';
import { disconnectAction, disconnectCursorAction, refreshEnrichmentAction } from './mutations';

export const metadata = { title: 'Connections · Zero Manual Coding' };

/**
 * Connections.
 *
 * Three different things share this page and the difference between them matters. The Cursor
 * key is how you signed in, and it is what makes your own agent data visible. GitHub and Jira
 * are credentials this app holds, so it can read merge state and ticket type. Cursor's own
 * connectors are a third thing entirely: they live inside Cursor, no API reports them, and
 * they cannot be configured from here — so this page infers what it can from agent data and
 * then tells you exactly where to go and what to click.
 */

const STATE_TONE = {
  detected: 'good',
  'not-detected': 'warn',
  'no-data': 'neutral',
} as const;

export default async function ConnectionsPage() {
  const { shellUser, nav, connection, connections, user } = await shellContext();
  const signals = await inferCursorConnectors(user.email);

  const github = connections.github;
  const jira = connections.jira;
  const cursor = connections.cursor;

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="Connections"
      subtitle="What this dashboard can see, and what it needs to see more"
      headerExtra={
        (github || jira) && (
          <form action={refreshEnrichmentAction}>
            <button type="submit" className="ui-btn ui-btn-ghost">
              <Icon name="repeat" size={14} />
              Refresh from GitHub and Jira
            </button>
          </form>
        )
      }
    >
      <div className="ui-col">
        <Card
          title="Cursor"
          note={cursor ? 'connected' : 'not connected — optional'}
          info="Optional. A key here is what makes your own Cloud Agent history readable; everything shared — the board, commands, rules, resources and news — works without one."
        >
          <div className="ui-col" style={{ gap: 12 }}>
            {cursor ? (
              <>
                <KeyValues
                  items={[
                    { label: 'Key', value: cursor.keyName ?? 'unnamed key' },
                    { label: 'Connected', value: formatDay(cursor.connectedAt) },
                    {
                      label: 'Last used',
                      value: cursor.lastUsedAt ? when(cursor.lastUsedAt) : 'not since it was stored',
                    },
                  ]}
                />
                {cursor.lastError && (
                  <Note>
                    The last call to Cursor with this key failed: {cursor.lastError}. If the key
                    was rotated, replace it below.
                  </Note>
                )}
                <Note>
                  A personal key can read your own Cloud Agents and nothing else. In-editor
                  figures — Tab completions, accepted lines, chat volume — come from a Cursor Team
                  Admin key held by whoever runs this deployment, and no personal key can
                  substitute for it.
                </Note>
                <form action={disconnectCursorAction}>
                  <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
                    Remove key
                  </button>
                </form>
              </>
            ) : (
              <p className="ui-muted">
                You signed in without a key, so this workspace is showing you its shared half:
                the Zero Manual Coding board, the commands and rules people have written down,
                the resources and the news. Add a key and three more pages appear — Dashboard,
                Impact and Actions — covering what your own Cloud Agents cost, what they
                shipped, and what is worth changing.
              </p>
            )}

            <CursorKeyForm connected={Boolean(cursor)} />
          </div>
        </Card>

        <div className="ui-grid ui-grid-2">
          <Card
            title="GitHub"
            note={github ? `connected as ${github.accountLabel ?? 'unknown'}` : 'not connected'}
            info="Read-only access, used to find out whether the pull requests your agents opened were merged."
          >
            <div className="ui-col" style={{ gap: 12 }}>
              <p className="ui-muted">
                Without this, the dashboard knows an agent opened a pull request but not what
                happened to it — so shipped work and abandoned work look identical.
              </p>

              {github && (
                <>
                  <KeyValues
                    items={[
                      { label: 'Account', value: github.accountLabel ?? '—' },
                      { label: 'Scopes', value: github.scopes ?? 'fine-grained token' },
                      { label: 'Connected', value: formatDay(github.connectedAt) },
                      {
                        label: 'Last checked',
                        value: github.lastValidatedAt ? when(github.lastValidatedAt) : 'never',
                      },
                    ]}
                  />
                  {github.lastError && <Note>Last failure: {github.lastError}</Note>}
                  <form action={disconnectAction}>
                    <input type="hidden" name="provider" value="github" />
                    <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
                      Disconnect
                    </button>
                  </form>
                </>
              )}

              <GitHubForm connected={Boolean(github)} />
            </div>
          </Card>

          <Card
            title="Jira"
            note={jira ? `connected as ${jira.accountLabel ?? 'unknown'}` : 'not connected'}
            info="Read-only access, used to classify agent work by ticket type and status."
          >
            <div className="ui-col" style={{ gap: 12 }}>
              <p className="ui-muted">
                Ticket type is the organisation's own answer to whether a piece of work was a
                feature or a fix. With Jira connected, cost splits by work type instead of
                sitting in one bucket.
              </p>

              {jira && (
                <>
                  <KeyValues
                    items={[
                      { label: 'Site', value: jira.baseUrl ?? '—' },
                      { label: 'Account', value: jira.accountLabel ?? jira.accountEmail ?? '—' },
                      { label: 'Connected', value: formatDay(jira.connectedAt) },
                      {
                        label: 'Last checked',
                        value: jira.lastValidatedAt ? when(jira.lastValidatedAt) : 'never',
                      },
                    ]}
                  />
                  {jira.lastError && <Note>Last failure: {jira.lastError}</Note>}
                  <form action={disconnectAction}>
                    <input type="hidden" name="provider" value="jira" />
                    <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
                      Disconnect
                    </button>
                  </form>
                </>
              )}

              <JiraForm
                connected={Boolean(jira)}
                defaultSite={jira?.baseUrl ?? undefined}
                defaultEmail={jira?.accountEmail ?? user.email}
              />
            </div>
          </Card>
        </div>

        <Card
          title="Cursor's own connectors"
          info="Cursor's GitHub App and Jira integration. No API reports whether they are installed, so this is inferred from what your agent data looks like."
        >
          <Note>
            These are not the same as the credentials above. Cursor's connectors are what let
            Cursor itself read your repository and your tickets, and they can only be set up in
            the Cursor dashboard — there is no API to read or create them. What follows is
            inference from your own agent history, so “no sign of it” means no evidence yet
            rather than definitely not connected.
          </Note>

          <div className="ui-rows" style={{ marginTop: 14 }}>
            {signals.map((signal) => (
              <div className="ui-row-card" key={signal.provider}>
                <div style={{ minWidth: 0 }}>
                  <div className="ui-row ui-row-tight">
                    <span className="ui-kpi-icon">
                      <Icon name={signal.provider === 'github' ? 'github' : 'ticket'} size={13} />
                    </span>
                    <span className="ui-row-title">
                      {signal.provider === 'github' ? 'Git connector' : 'Jira integration'}
                    </span>
                    <Tag tone={STATE_TONE[signal.state]}>{signal.headline}</Tag>
                    <Tag>inferred</Tag>
                  </div>
                  <p className="ui-row-sub">{signal.detail}</p>
                  {signal.evidence.length > 0 && (
                    <div className="ui-evidence" style={{ marginTop: 8 }}>
                      {signal.evidence.map((item) => (
                        <span className="ui-evidence-chip" key={item.label}>
                          {item.label} <b>{item.value}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="ui-grid ui-grid-2" style={{ marginTop: 16 }}>
            <div>
              <div className="ui-section-label">Set up the Git connector</div>
              <ol className="ui-steps">
                <li>
                  Open{' '}
                  <a
                    href="https://cursor.com/dashboard?tab=integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    cursor.com/dashboard
                  </a>{' '}
                  and go to <b>Integrations</b>.
                </li>
                <li>
                  Under <b>GitHub</b>, choose <b>Connect</b> and install the Cursor GitHub App on
                  the organisation that owns your repositories.
                </li>
                <li>
                  Grant it the repositories your agents need. Granting all of them is convenient;
                  granting the handful you actually work in is better.
                </li>
                <li>
                  Start a Cloud Agent and pick a repository. Once one run carries a repository
                  URL, the inference above flips to detected.
                </li>
              </ol>
            </div>

            <div>
              <div className="ui-section-label">Set up the Jira integration</div>
              <ol className="ui-steps">
                <li>
                  In the same <b>Integrations</b> tab, find <b>Jira</b> and follow the Atlassian
                  consent flow for your site.
                </li>
                <li>
                  An Atlassian admin may have to approve the app. If the flow stops with a
                  permissions message, that is what it is asking for.
                </li>
                <li>
                  Name branches after the ticket, e.g.{' '}
                  <code>feature/VCAP-1192-config-viewer</code>. This is what actually ties agent
                  work to a ticket — the connector alone cannot guess it.
                </li>
                <li>
                  Connect Jira above as well. Cursor's integration helps Cursor; the credential
                  above is what lets this dashboard read ticket types.
                </li>
              </ol>
            </div>
          </div>
        </Card>

        <Card>
          <p className="ui-faint">
            <Icon name="lock" size={12} /> Tokens are encrypted with AES-256-GCM before they are
            stored and are never written to logs. They are used only for reads, and only on
            behalf of your own account.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
