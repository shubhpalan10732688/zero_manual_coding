import { Icon } from '../ui/Icons';
import { Tag } from '../ui/Tag';
import { days, initials, plural, when } from '../ui/format';
import type { BoardPost } from '../lib/board';

import { likeAction } from './mutations';

/**
 * One achievement card.
 *
 * What somebody achieved and what it saved them. The savings sit in their own strip and are
 * labelled self-reported, because they are the one figure here that no system verified.
 *
 * The like is a plain form, so the feed stays a server component and works before any
 * JavaScript loads. It replaced a row of four emoji: nobody could say what the difference
 * between 🔥 and 👏 was meant to be, and a count made of four things cannot be turned into a
 * sentence. "Nine people found this useful" can.
 */

export function LikeButton({ post, size }: { post: BoardPost; size?: 'lg' }) {
  const label = post.liked ? 'Liked' : 'Like';

  return (
    <form action={likeAction} className="ui-like-form">
      <input type="hidden" name="id" value={post.id} />
      <button
        type="submit"
        className={size === 'lg' ? 'ui-like ui-like-lg' : 'ui-like'}
        data-liked={post.liked ? 'true' : 'false'}
        aria-pressed={post.liked}
        aria-label={
          post.liked
            ? `Remove your like from ${post.title}`
            : `Like ${post.title}`
        }
      >
        <Icon name="heart" size={size === 'lg' ? 16 : 14} filled={post.liked} />
        <span>{label}</span>
        {post.likes > 0 && <span className="ui-like-count">{post.likes}</span>}
      </button>
      {size === 'lg' && (
        <span className="ui-faint">
          {post.likes > 0
            ? `${post.likes} ${plural(post.likes, 'person', 'people')} found this useful`
            : 'Be the first to say this was useful'}
        </span>
      )}
    </form>
  );
}

export function SavingsStrip({ post }: { post: BoardPost }) {
  if (post.effortSavedPct === null && post.timeSavedDays === null) return null;

  return (
    <div className="ui-metrics">
      {post.effortSavedPct !== null && (
        <span className="ui-metric ui-metric-good">
          <b>~{post.effortSavedPct}%</b>
          <span>effort saved</span>
        </span>
      )}
      {post.timeSavedDays !== null && (
        <span className="ui-metric ui-metric-good">
          <b>~{days(post.timeSavedDays)} {plural(post.timeSavedDays, 'day')}</b>
          <span>time saved</span>
        </span>
      )}
      <span className="ui-metric">
        <b>Self-reported</b>
        <span>written by the author</span>
      </span>
    </div>
  );
}

export function PostCard({ post }: { post: BoardPost }) {
  const summary = post.delivered ?? post.context ?? '';

  return (
    <article className="ui-post">
      <div className="ui-post-head">
        <span className="ui-avatar-sm">{initials(post.authorName, '?')}</span>
        <span>
          <span className="ui-post-author">{post.authorName}</span>
          <br />
          <span className="ui-post-when">
            {post.teamName ? `${post.teamName} · ` : ''}
            {when(post.happenedOn)}
          </span>
        </span>
        {post.likes > 0 && (
          <span className="ui-like-badge" title={`${post.likes} ${plural(post.likes, 'like')}`}>
            <Icon name="heart" size={12} filled />
            {post.likes}
          </span>
        )}
      </div>

      <h3 className="ui-post-title">
        <a href={`/app/board/${post.id}`}>
          {post.ticketKeys.length > 0 && `${post.ticketKeys.join(', ')}: `}
          {post.title}
        </a>
      </h3>

      {summary && <p className="ui-muted">{summary.slice(0, 260)}{summary.length > 260 ? '…' : ''}</p>}

      <SavingsStrip post={post} />

      <div className="ui-post-foot">
        <LikeButton post={post} />
        <span className="ui-row ui-row-tight">
          {post.collaboratorNames.length > 0 && (
            <span className="ui-faint">
              with {post.collaboratorNames.slice(0, 3).join(', ')}
              {post.collaboratorNames.length > 3 && ` +${post.collaboratorNames.length - 3}`}
            </span>
          )}
          {post.tags.slice(0, 3).map((tag) => (
            <Tag tone="blue" key={tag}>
              {tag}
            </Tag>
          ))}
          <a className="ui-card-action" href={`/app/board/${post.id}`}>
            Read the write-up
          </a>
        </span>
      </div>
    </article>
  );
}
