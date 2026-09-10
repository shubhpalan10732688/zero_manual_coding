import { notFound } from 'next/navigation';

import { Card, KeyValues, Note } from '../../ui/Card';
import { Icon } from '../../ui/Icons';
import { RichText, Section } from '../../ui/RichText';
import { Shell } from '../../ui/Shell';
import { SubmitButton } from '../../ui/SubmitButton';
import { ConfidenceNote, Tag } from '../../ui/Tag';
import { days as formatDays, formatDay, initials, plural, shortRepo } from '../../ui/format';
import { boardPost } from '../../lib/board';
import { shellContext } from '../../lib/shell';
import { LikeButton } from '../PostCard';
import { hidePostAction } from '../mutations';

/**
 * One write-up in full.
 *
 * Most of the body is optional, and posts written through the short form carry only a title,
 * what was delivered and the savings. Every section below renders nothing at all when its
 * field is empty, so a four-field post reads as a complete short entry rather than a long one
 * with holes in it.
 */
export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const { shellUser, nav, connection, user } = await shellContext();

  const numericId = Number(id);
  if (!Number.isFinite(numericId)) notFound();

  const post = await boardPost(user.email, numericId);
  if (!post) notFound();

  const isAuthor = post.authorEmail === user.email;
  if (post.hidden && !isAuthor && !user.isAdmin) notFound();

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title={post.title}
      subtitle={`${post.authorName} · ${formatDay(post.happenedOn)}`}
    >
      <div className="ui-col ui-story-detail">
        <div className="ui-breadcrumb">
          <a href="/app/board">Zero Manual Coding</a>
          <span className="ui-breadcrumb-sep">/</span>
          <span>{post.ticketKeys[0] ?? 'Write-up'}</span>
        </div>

        {search.new === '1' && (
          <Card>
            <Note>
              Posted, and on the board for everyone who can sign in here. The link to this page
              is stable, so it stays findable however long from now.
            </Note>
          </Card>
        )}

        {post.hidden && (
          <Card>
            <Note>
              This post is hidden from the public wall. Its author and administrators can still review it. Publish it again below when you want
              it back on the board.
            </Note>
          </Card>
        )}

        <div className="ui-with-rail">
          <div className="ui-col">
            <Card>
              <div className="ui-row ui-row-tight" style={{ marginBottom: 12 }}>
                <span className="ui-avatar-sm">{initials(post.authorName, '?')}</span>
                <span className="ui-post-author">{post.authorName}</span>
                {post.teamName && <Tag>{post.teamName}</Tag>}
                {post.ticketKeys.map((key) => (
                  <Tag tone="primary" key={key}>
                    {key}
                  </Tag>
                ))}
                {post.tags.map((tag) => (
                  <Tag tone="accent" key={tag}>
                    {tag}
                  </Tag>
                ))}
              </div>

              <div className="ui-col" style={{ gap: 16 }}>
                <Section label="Context" text={post.context} />
                <Section label="How this was achieved with AI" text={post.delivered} />

                {(post.helpPlanning || post.helpImplementation) && (
                  <div>
                    <div className="ui-section-label">How AI helped</div>
                    {post.helpPlanning && (
                      <>
                        <p className="ui-strong">Problem diagnosis and planning</p>
                        <RichText text={post.helpPlanning} />
                      </>
                    )}
                    {post.helpImplementation && (
                      <>
                        <p className="ui-strong" style={{ marginTop: 10 }}>
                          Implementation
                        </p>
                        <RichText text={post.helpImplementation} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card
              title="Benefits"
              info="Estimated by the person who did the work. These savings are self-reported, not independently verified."
            >
              {post.effortSavedPct !== null || post.timeSavedDays !== null ? (
                <>
                  <div className="ui-metrics">
                    {post.effortSavedPct !== null && (
                      <span className="ui-metric ui-metric-good">
                        <b>~{post.effortSavedPct}%</b>
                        <span>effort saved</span>
                      </span>
                    )}
                    {post.timeSavedDays !== null && (
                      <span className="ui-metric ui-metric-good">
                        <b>
                          ~{formatDays(post.timeSavedDays)}{' '}
                          {plural(post.timeSavedDays, 'day')}
                        </b>
                        <span>time saved</span>
                      </span>
                    )}
                  </div>
                  {post.benefitsNote && (
                    <div style={{ marginTop: 12 }}>
                      <Section label="How that was arrived at" text={post.benefitsNote} />
                    </div>
                  )}
                  <ConfidenceNote level="low" />
                </>
              ) : (
                <Note>The author did not estimate a saving for this one.</Note>
              )}
            </Card>

            <Card title="Was this useful?">
              <LikeButton post={post} size="lg" />
            </Card>
          </div>

          <aside className="ui-rail">
            <Card title="Details">
              {/* Rows with nothing in them are left out rather than shown as a dash, so a
                  short post does not read as an unfinished long one. */}
              <KeyValues
                items={[
                  { label: 'Author', value: post.authorName },
                  { label: 'Posted', value: formatDay(post.happenedOn) },
                  ...(post.teamName ? [{ label: 'Team', value: post.teamName }] : []),
                  ...(post.repo
                    ? [{ label: 'Repository', value: shortRepo(post.repo) ?? post.repo }]
                    : []),
                  ...(post.prUrl
                    ? [
                        {
                          label: 'Pull request',
                          value: (
                            <a href={post.prUrl} target="_blank" rel="noopener noreferrer">
                              Open <Icon name="external" size={11} />
                            </a>
                          ),
                        },
                      ]
                    : []),
                  ...(post.collaboratorNames.length > 0
                    ? [{ label: 'Worked with', value: post.collaboratorNames.join(', ') }]
                    : []),
                ]}
              />
            </Card>

            {(isAuthor || user.isAdmin) && (
              <Card title="Publication settings">
                <form action={hidePostAction} className="ui-col" style={{ gap: 10 }}>
                  <input type="hidden" name="id" value={post.id} />
                  {!post.hidden && <input type="hidden" name="hide" value="on" />}
                  <p className="ui-muted">
                    {post.hidden
                      ? 'Put this back on the wall where everyone can read it.'
                      : 'Hiding removes it from the wall and from every total, but keeps the write-up and its likes.'}
                  </p>
                  <SubmitButton className="ui-btn ui-btn-ghost ui-btn-sm" pendingLabel="Updating visibility…">
                    <Icon name={post.hidden ? 'eye' : 'lock'} size={13} />
                    {post.hidden ? 'Publish again' : 'Hide from the board'}
                  </SubmitButton>
                </form>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
