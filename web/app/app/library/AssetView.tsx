import { notFound } from 'next/navigation';

import { Card, KeyValues, Note } from '../ui/Card';
import { CopyButton } from '../ui/CopyButton';
import { Icon } from '../ui/Icons';
import { RichText } from '../ui/RichText';
import { Shell } from '../ui/Shell';
import { Tag } from '../ui/Tag';
import { count, formatDay, initials, plural, when } from '../ui/format';
import { getAsset, installBody, installPath, type AssetKind } from '../lib/library';
import { shellContext } from '../lib/shell';

import { InstallButton } from './InstallButton';
import { setAssetStatusAction, voteAssetAction } from './mutations';

/**
 * One command or rule, with everything needed to use it.
 *
 * The body is shown as a code block rather than rendered prose, because it is text meant to
 * be pasted verbatim — reformatting it would be actively harmful. For rules the copy button
 * adds the front matter Cursor expects, so what lands on the clipboard is a working file and
 * not something the reader has to assemble.
 */
export async function AssetView({
  kind,
  slug,
  isNew,
}: {
  kind: AssetKind;
  slug: string;
  isNew: boolean;
}) {
  const { shellUser, nav, connection, user } = await shellContext();
  const asset = await getAsset(user.email, kind, slug);
  if (!asset) notFound();

  const isAuthor = asset.authorEmail === user.email;
  if (asset.status !== 'published' && !isAuthor && !user.isAdmin) notFound();

  const base = kind === 'command' ? '/app/commands' : '/app/rules';
  const path = installPath(asset);
  const body = installBody(asset);

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title={asset.title}
      subtitle={`${kind === 'command' ? 'Command' : 'Rule'} by ${asset.authorName} · ${asset.category}`}
      headerExtra={<InstallButton id={asset.id} text={body} label={`Copy ${kind}`} />}
    >
      <div className="ui-col">
        <div className="ui-breadcrumb">
          <a href={base}>{kind === 'command' ? 'Commands' : 'Rules'}</a>
          <span className="ui-breadcrumb-sep">/</span>
          <span>{asset.title}</span>
        </div>

        {isNew && (
          <Card>
            <Note>
              Saved{asset.status === 'draft' ? ' as a draft, visible only to you' : ' and on the shelf'}.
              Copy it into your own repository with the button above to check it behaves the way
              you expect.
            </Note>
          </Card>
        )}

        <div className="ui-with-rail">
          <div className="ui-col">
            {asset.description && (
              <Card title="What it is for">
                <RichText text={asset.description} />
              </Card>
            )}

            <Card
              title={kind === 'command' ? 'The prompt' : 'The rule'}
              note={path}
              info="Exactly as the author wrote it. Copied verbatim, with the front matter Cursor needs where the kind requires it."
              header={<CopyButton text={asset.body} label="Copy body only" />}
            >
              <div className="ui-codeblock">
                <div className="ui-codeblock-head">{path}</div>
                <pre>{body}</pre>
              </div>
            </Card>

            <Card title="How to use it">
              <ol className="ui-steps">
                <li>
                  Create <code>{path}</code> in the repository where you want it.
                </li>
                <li>Paste the contents above into it and commit.</li>
                {kind === 'command' ? (
                  <li>
                    In Cursor, type <code>/{asset.slug}</code> in the chat input and the command
                    runs against whatever you have open.
                  </li>
                ) : (
                  <li>
                    Cursor picks the rule up automatically.{' '}
                    {asset.globPattern
                      ? `It applies to files matching ${asset.globPattern}.`
                      : asset.alwaysApply
                        ? 'It is set to stay in context for every conversation in the repository.'
                        : 'It applies when the agent judges it relevant, since no glob was set.'}
                  </li>
                )}
                <li>
                  If you change it in a way others would want, come back and{' '}
                  <a href={`${base}/new`}>publish the improved version</a> rather than keeping it
                  local.
                </li>
              </ol>
            </Card>
          </div>

          <aside className="ui-rail">
            <Card title="Details">
              <KeyValues
                items={[
                  { label: 'Author', value: asset.authorName },
                  { label: 'Category', value: asset.category },
                  { label: 'Added', value: formatDay(asset.updatedAt) },
                  { label: 'Votes', value: count(asset.votes) },
                  {
                    label: 'Copies',
                    value: `${count(asset.copies)} ${plural(asset.copies, 'time')}`,
                  },
                  ...(kind === 'rule'
                    ? [
                        { label: 'Applies to', value: asset.globPattern ?? 'not scoped' },
                        { label: 'Always in context', value: asset.alwaysApply ? 'yes' : 'no' },
                      ]
                    : []),
                ]}
              />

              <div className="ui-row ui-row-tight" style={{ marginTop: 12 }}>
                <span className="ui-avatar-sm">{initials(asset.authorName, '?')}</span>
                <span className="ui-faint">
                  {asset.authorName}
                  <br />
                  updated {when(asset.updatedAt)}
                </span>
              </div>
            </Card>

            <Card title="Was this useful?">
              <p className="ui-muted">
                Votes are how the list is ordered. It is the only way anyone can tell which of
                these are worth their time.
              </p>
              <form action={voteAssetAction} style={{ marginTop: 10 }}>
                <input type="hidden" name="id" value={asset.id} />
                <button
                  type="submit"
                  className={`ui-btn ui-btn-block ${asset.votedByMe ? 'ui-btn-good' : 'ui-btn-ghost'}`}
                >
                  <Icon name={asset.votedByMe ? 'check' : 'arrowUp'} size={13} />
                  {asset.votedByMe ? `You voted · ${asset.votes}` : `Vote · ${asset.votes}`}
                </button>
              </form>
            </Card>

            {asset.tags.length > 0 && (
              <Card title="Tags">
                <div className="ui-row ui-row-tight">
                  {asset.tags.map((tag) => (
                    <Tag tone="blue" key={tag}>
                      {tag}
                    </Tag>
                  ))}
                </div>
              </Card>
            )}

            {(isAuthor || user.isAdmin) && (
              <Card title="Manage">
                <div className="ui-col" style={{ gap: 8 }}>
                  {asset.status !== 'published' && (
                    <form action={setAssetStatusAction}>
                      <input type="hidden" name="id" value={asset.id} />
                      <input type="hidden" name="status" value="published" />
                      <button type="submit" className="ui-btn ui-btn-good ui-btn-sm ui-btn-block">
                        Publish
                      </button>
                    </form>
                  )}
                  {asset.status === 'published' && (
                    <form action={setAssetStatusAction}>
                      <input type="hidden" name="id" value={asset.id} />
                      <input type="hidden" name="status" value="archived" />
                      <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-block">
                        Archive
                      </button>
                    </form>
                  )}
                  <p className="ui-faint">
                    Archiving hides it from the list. Anyone who already copied it keeps their
                    copy, which is the honest consequence of a catalogue people paste from.
                  </p>
                </div>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
