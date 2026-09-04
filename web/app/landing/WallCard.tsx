import type { BoardPost } from '../app/lib/board';
import { Icon } from '../app/ui/Icons';
import { Tag } from '../app/ui/Tag';
import { days, initials, plural, when } from '../app/ui/format';

import { AuthLink } from './SignIn';

/**
 * One achievement as an anonymous reader sees it.
 *
 * A separate component from the signed-in PostCard rather than a `readOnly` prop on it,
 * because the two differ in what they may do rather than in how they look: nothing here can
 * write, since there is no identity to attribute a like to, and every control routes through
 * the sign-in dialog instead. Keeping that in the type system means a future edit to the
 * board card cannot accidentally expose a mutation publicly.
 *
 * The featured variant is the most-liked achievement on the wall. It gets the room to show
 * its whole opening paragraph, because the first card is the one that teaches a stranger
 * what a good write-up looks like, and a truncated one teaches them nothing.
 */

function summaryOf(post: BoardPost, limit: number): string {
  const source = post.delivered ?? post.context ?? '';
  return source.length > limit ? `${source.slice(0, limit).trimEnd()}…` : source;
}

function Likes({ post }: { post: BoardPost }) {
  return (
    <AuthLink
      href={`/app/board/${post.id}`}
      className="ui-like"
      title={post.likes > 0 ? `${post.likes} ${plural(post.likes, 'like')}` : 'Sign in to like this'}
    >
      <Icon name="heart" size={14} filled={post.likes > 0} />
      <span>Like</span>
      {post.likes > 0 && <span className="ui-like-count">{post.likes}</span>}
    </AuthLink>
  );
}

export function WallCard({ post, featured = false }: { post: BoardPost; featured?: boolean }) {
  const href = `/app/board/${post.id}`;
  const summary = summaryOf(post, featured ? 460 : 200);

  return (
    <article className={featured ? 'ui-wall-card ui-wall-card-featured' : 'ui-wall-card'}>
      <div className="ui-wall-head">
        <span className="ui-avatar-sm">{initials(post.authorName, '?')}</span>
        <span className="ui-wall-who">
          <span className="ui-post-author">{post.authorName}</span>
          <span className="ui-post-when">
            {post.teamName ? `${post.teamName} · ` : ''}
            {when(post.happenedOn)}
          </span>
        </span>
        {featured && (
          <span className="ui-wall-badge">
            <Icon name="star" size={11} filled />
            Most liked
          </span>
        )}
      </div>

      <h3 className={featured ? 'ui-wall-title ui-wall-title-lg' : 'ui-wall-title'}>
        <AuthLink href={href}>{post.title}</AuthLink>
      </h3>

      {summary && <p className="ui-wall-summary">{summary}</p>}

      {(post.effortSavedPct !== null || post.timeSavedDays !== null) && (
        <div className="ui-wall-savings">
          {post.timeSavedDays !== null && (
            <span className="ui-wall-saving">
              <b>~{days(post.timeSavedDays)}</b>
              <span>{plural(post.timeSavedDays, 'day')} saved</span>
            </span>
          )}
          {post.effortSavedPct !== null && (
            <span className="ui-wall-saving">
              <b>~{post.effortSavedPct}%</b>
              <span>less effort</span>
            </span>
          )}
          <span className="ui-wall-selfreported">Self-reported</span>
        </div>
      )}

      <div className="ui-wall-foot">
        <Likes post={post} />
        <span className="ui-row ui-row-tight">
          {post.ticketKeys.slice(0, 1).map((key) => (
            <Tag key={key}>{key}</Tag>
          ))}
          {post.tags.slice(0, featured ? 3 : 2).map((tag) => (
            <Tag tone="blue" key={tag}>
              {tag}
            </Tag>
          ))}
          <AuthLink className="ui-card-action" href={href}>
            Read it
            <Icon name="chevronRight" size={12} />
          </AuthLink>
        </span>
      </div>
    </article>
  );
}
