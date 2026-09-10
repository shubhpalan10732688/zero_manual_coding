import Link from 'next/link';

import { Card, Empty, Note } from '../ui/Card';
import { SearchBox } from '../ui/Filters';
import { Icon } from '../ui/Icons';
import { StatTile } from '../ui/Kpi';
import { Shell } from '../ui/Shell';
import { count, days as formatDays, initials, percent, plural, when } from '../ui/format';
import { boardFeed, boardLeaderboard, boardTotals } from '../lib/board';
import { one, shellContext, type SearchParams } from '../lib/shell';

import { PostCard } from './PostCard';

/**
 * The Zero Manual Coding board.
 *
 * A place where delivered work can be found later, summed, and attributed to whoever did it.
 * The board deliberately does not try to compute anyone's saving: the author states it, the
 * board adds it up, and every total says how many posts it rests on.
 */

const PAGE_SIZE = 12;

export default async function BoardPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { shellUser, nav, connection, user } = await shellContext();

  const search = one(params.q);
  const page = Math.max(Number(one(params.page) ?? '1') || 1, 1);

  const [posts, totals, leaders] = await Promise.all([
    boardFeed(user.email, { search }, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    boardTotals(),
    boardLeaderboard(6),
  ]);

  const hasMore = posts.length > PAGE_SIZE;
  const shown = posts.slice(0, PAGE_SIZE);

  const queryString = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { q: search, ...overrides };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const rendered = next.toString();
    return rendered ? `/app/board?${rendered}` : '/app/board';
  };

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="Achievement board"
      subtitle="The work, the people, and the progress behind it."
      headerExtra={
        <Link className="ui-btn ui-btn-primary" href="/app/board/new">
          <Icon name="plus" size={14} />
          Add an achievement
        </Link>
      }
    >
      <div className="ui-col ui-board">
        <section className="ui-board-intro">
          <div>
            <span className="ui-section-label">Zero Manual Coding</span>
            <h2>A shared record of progress.</h2>
            <p>Discover a useful approach. Recognise a colleague. Share what worked for you.</p>
          </div>
          <span className="ui-board-trust"><Icon name="info" size={15} /> Real stories. Self-reported impact.</span>
        </section>
        <div className="ui-board-overview">
        <Card
          title="Community at a glance"
          info="Counts are of achievements. Effort and time saved are self-reported by the people who wrote them, so each total says how many carried a figure."
        >
          <div className="ui-grid ui-grid-5">
            <StatTile
              label="Achievements"
              value={count(totals.posts)}
              hint={`${totals.posts30d} in the last 30 days`}
            />
            <StatTile label="Contributors" value={count(totals.contributors)} hint="people who shared one" />
            <StatTile
              label="Days saved"
              value={formatDays(totals.daysSaved)}
              hint={`self-reported across ${totals.postsWithDays} ${plural(totals.postsWithDays, 'achievement')}`}
            />
            <StatTile
              label="Typical effort saved"
              value={totals.postsWithEffort > 0 ? percent(totals.avgEffortSavedPct / 100) : '—'}
              hint={`mean of ${totals.postsWithEffort} ${plural(totals.postsWithEffort, 'estimate')}`}
            />
            <StatTile
              label="Tickets referenced"
              value={count(totals.ticketsReferenced)}
              hint="mentions across achievements"
            />
          </div>
        </Card>
        </div>

        <div className="ui-with-rail">
          <div className="ui-col">
            <div className="ui-feed-heading">
              <h2>Explore the achievements</h2>
              <span>{shown.length} {plural(shown.length, 'story', 'stories')} on this page</span>
            </div>
            <div className="ui-board-filters">
            <Card>
              <SearchBox
                action="/app/board"
                placeholder="Search by achievement, keyword or ticket…"
                value={search}
              />
            </Card>
            </div>

            {shown.length > 0 ? (
              <div className="ui-feed">
                {shown.map((post) => (
                  <PostCard post={post} key={post.id} />
                ))}
              </div>
            ) : (
              <Card>
                <Note>
                  {search
                    ? 'No achievements match your search. Try another keyword, or empty the search box and search again to see all achievements.'
                    : 'The wall is empty. The first achievement is the hardest one — write up the last thing an agent helped you get done, however small, and the rest of the team will have a shape to copy.'}
                </Note>
                <div className="ui-row" style={{ marginTop: 12 }}>
                  <a className="ui-btn ui-btn-primary" href="/app/board/new">
                    <Icon name="plus" size={14} />
                    Add an achievement
                  </a>
                </div>
              </Card>
            )}

            {(page > 1 || hasMore) && (
              <div className="ui-pager">
                {page > 1 ? (
                  <a className="ui-btn ui-btn-ghost ui-btn-sm" href={queryString({ page: String(page - 1) })}>
                    <Icon name="chevronLeft" size={13} />
                    Newer
                  </a>
                ) : (
                  <span />
                )}
                <span className="ui-faint">Page {page}</span>
                {hasMore ? (
                  <a className="ui-btn ui-btn-ghost ui-btn-sm" href={queryString({ page: String(page + 1) })}>
                    Older
                    <Icon name="chevronRight" size={13} />
                  </a>
                ) : (
                  <span />
                )}
              </div>
            )}
          </div>

          <aside className="ui-rail ui-board-rail">
            <div className="ui-rail-head">
              <span className="ui-rail-title">
                <Icon name="award" size={16} /> Community contributors
              </span>
              <span className="ui-rail-sub">By self-reported days saved</span>
            </div>

            {leaders.length > 0 ? (
              <div className="ui-rows">
                {leaders.map((leader) => (
                  <div
                    className="ui-row-card"
                    key={leader.email}
                  >
                    <span className="ui-row ui-row-tight">
                      <span className="ui-avatar-sm">{initials(leader.name, '?')}</span>
                      <span>
                        <span className="ui-row-title">{leader.name}</span>
                        <span className="ui-row-sub">
                          {leader.teamName ?? 'no team'} · last posted {when(leader.latestPost)}
                        </span>
                      </span>
                    </span>
                    <span className="ui-metric ui-metric-good">
                      <b>{formatDays(leader.daysSaved)}d</b>
                      <span>
                        {leader.posts} {plural(leader.posts, 'post')}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Nobody has posted yet.</Empty>
            )}

            <Card title="A useful story starts here">
              <ul className="ui-list">
                <li>Say what you achieved before saying how the agent helped.</li>
                <li>
                  Small counts. A migration nobody noticed and a flaky test finally fixed teach
                  as much as a feature.
                </li>
                <li>Name the ticket, so the work can be found later.</li>
                <li>
                  Estimate the saving against what it would have taken by hand, and be honest —
                  the wall is more useful with modest numbers people believe.
                </li>
              </ul>
            </Card>
            {user.isAdmin && (
              <div className="ui-moderation-note">
                <Icon name="shield" size={18} />
                <div><strong>Administrator access</strong><p>Open any achievement to review its details and manage its visibility.</p></div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Shell>
  );
}
