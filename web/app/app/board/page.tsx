import { Card, Empty, Note } from '../ui/Card';
import { FilterChips, SearchBox } from '../ui/Filters';
import { Icon } from '../ui/Icons';
import { StatTile } from '../ui/Kpi';
import { Shell } from '../ui/Shell';
import { count, days as formatDays, initials, percent, plural, when } from '../ui/format';
import { boardFacets, boardFeed, boardLeaderboard, boardTotals } from '../lib/board';
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

  const team = one(params.team);
  const tag = one(params.tag);
  const search = one(params.q);
  const author = one(params.author);
  const mine = one(params.mine) === '1';
  const page = Math.max(Number(one(params.page) ?? '1') || 1, 1);

  const filters = { team, tag, search, author, mine };
  const [posts, totals, leaders, facets] = await Promise.all([
    boardFeed(user.email, filters, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
    boardTotals(),
    boardLeaderboard(6),
    boardFacets(),
  ]);

  const hasMore = posts.length > PAGE_SIZE;
  const shown = posts.slice(0, PAGE_SIZE);

  const queryString = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { team, tag, q: search, author, mine: mine ? '1' : undefined, ...overrides };
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
      title="Zero Manual Coding"
      subtitle="What people here achieved with AI, in their own words"
      headerExtra={
        <a className="ui-btn ui-btn-primary" href="/app/board/new">
          <Icon name="plus" size={14} />
          Add an achievement
        </a>
      }
    >
      <div className="ui-col">
        <Card
          title="The wall so far"
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
              hint="distinct keys mentioned"
            />
          </div>
        </Card>

        <div className="ui-with-rail">
          <div className="ui-col">
            <Card>
              <div className="ui-col" style={{ gap: 10 }}>
                <SearchBox
                  action="/app/board"
                  placeholder="Search achievements, write-ups and ticket keys"
                  value={search}
                  keep={{ team, tag, author, mine: mine ? '1' : undefined }}
                />

                <FilterChips
                  options={facets.teams.map((entry) => ({ id: entry, label: entry }))}
                  active={team}
                  allLabel="Every team"
                  allHref={queryString({ team: undefined, page: undefined })}
                  hrefFor={(id) => queryString({ team: id, page: undefined })}
                />

                {facets.tags.length > 0 && (
                  <FilterChips
                    options={facets.tags.map((entry) => ({ id: entry, label: entry }))}
                    active={tag}
                    allLabel="Any tag"
                    allHref={queryString({ tag: undefined, page: undefined })}
                    hrefFor={(id) => queryString({ tag: id, page: undefined })}
                  />
                )}

                <div className="ui-filters">
                  <a
                    className="ui-chip"
                    href={queryString({ mine: mine ? undefined : '1', page: undefined })}
                    aria-current={mine ? 'true' : undefined}
                  >
                    Only mine
                  </a>
                  {author && (
                    <a
                      className="ui-chip"
                      href={queryString({ author: undefined, page: undefined })}
                      aria-current="true"
                    >
                      {author} — clear
                    </a>
                  )}
                </div>
              </div>
            </Card>

            {shown.length > 0 ? (
              <div className="ui-feed">
                {shown.map((post) => (
                  <PostCard post={post} key={post.id} />
                ))}
              </div>
            ) : (
              <Card>
                <Note>
                  {search || team || tag || author || mine
                    ? 'Nothing matches those filters. Clear them and the whole wall comes back.'
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

          <aside className="ui-rail">
            <div className="ui-rail-head">
              <span className="ui-rail-title">
                <Icon name="award" size={14} /> Most shared
              </span>
              <span className="ui-rail-sub">By self-reported days saved</span>
            </div>

            {leaders.length > 0 ? (
              <div className="ui-rows">
                {leaders.map((leader) => (
                  <a
                    className="ui-row-card"
                    href={`/app/board?author=${encodeURIComponent(leader.email)}`}
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
                  </a>
                ))}
              </div>
            ) : (
              <Empty>Nobody has posted yet.</Empty>
            )}

            <Card title="What makes a good achievement">
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
          </aside>
        </div>
      </div>
    </Shell>
  );
}
