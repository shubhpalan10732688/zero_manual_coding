import { Card, Empty, Note } from '../ui/Card';
import { FilterChips, SearchBox } from '../ui/Filters';
import { Icon } from '../ui/Icons';
import { Shell } from '../ui/Shell';
import { Tag } from '../ui/Tag';
import { when } from '../ui/format';
import { lastFetchedAt, listNews, listSources, newsCategories } from '../lib/news';
import { one, shellContext, type SearchParams } from '../lib/shell';

import { LinkForm } from './LinkForm';
import { hideNewsItemAction, refreshNewsAction, toggleSourceAction } from './mutations';

export const metadata = { title: 'AI News · Zero Manual Coding' };

/**
 * AI news.
 *
 * Reads only from the database. Feeds are pulled by a scheduled job, so a network that blocks
 * outbound requests makes this page stale rather than slow — and the "as of" line says which
 * it is. Where a source has been failing, the rail says so plainly instead of leaving readers
 * to wonder why a familiar publication stopped appearing.
 */
export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { shellUser, nav, connection, user } = await shellContext();

  const category = one(params.category);
  const search = one(params.q);

  const [items, categories, sources, fetchedAt] = await Promise.all([
    listNews({ category, search }),
    newsCategories(),
    listSources(),
    lastFetchedAt(),
  ]);

  const failing = sources.filter((source) => source.enabled && source.lastError);

  const link = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ category, q: search, ...overrides })) {
      if (value) next.set(key, value);
    }
    const rendered = next.toString();
    return rendered ? `/app/news?${rendered}` : '/app/news';
  };

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="AI News"
      subtitle="Launches, updates and things worth knowing about the tools we use"
      headerExtra={
        user.isAdmin ? (
          <form action={refreshNewsAction}>
            <button type="submit" className="ui-btn ui-btn-ghost">
              <Icon name="repeat" size={14} />
              Refresh feeds
            </button>
          </form>
        ) : undefined
      }
    >
      <div className="ui-col">
        <div className="ui-with-rail">
          <div className="ui-col">
            <Card>
              <div className="ui-col" style={{ gap: 10 }}>
                <SearchBox
                  action="/app/news"
                  placeholder="Search headlines and summaries"
                  value={search}
                  keep={{ category }}
                />
                <FilterChips
                  options={categories.map((entry) => ({ id: entry, label: entry }))}
                  active={category}
                  allLabel="Everything"
                  allHref={link({ category: undefined })}
                  hrefFor={(id) => link({ category: id })}
                />
              </div>
            </Card>

            <Card
              title="The feed"
              note={fetchedAt ? `as of ${when(fetchedAt)}` : 'never fetched'}
              info="Items pulled from configured feeds on a schedule, plus anything colleagues posted by hand."
            >
              {items.length > 0 ? (
                <div className="ui-col" style={{ gap: 0 }}>
                  {items.map((item) => (
                    <div className="ui-article" key={item.id}>
                      <a
                        className="ui-article-title"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.title}
                        <Icon name="external" size={11} />
                      </a>

                      {item.summary && <p className="ui-muted">{item.summary}</p>}

                      <span className="ui-article-meta">
                        <span>
                          {item.postedBy
                            ? `posted by ${item.postedByName}`
                            : (item.sourceName ?? 'unknown source')}
                        </span>
                        <span>{when(item.publishedAt ?? item.fetchedAt)}</span>
                        {item.author && !item.postedBy && <span>{item.author}</span>}
                        {item.tags.slice(0, 2).map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                        {(item.postedBy === user.email || user.isAdmin) && (
                          <form action={hideNewsItemAction}>
                            <input type="hidden" name="id" value={item.id} />
                            <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
                              Hide
                            </button>
                          </form>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Note>
                  Nothing in the feed yet. Either the scheduled pull has not run, or this
                  deployment cannot reach the sources — the rail shows which. In the meantime,
                  anything worth reading can be posted by hand.
                </Note>
              )}
            </Card>
          </div>

          <aside className="ui-rail">
            <Card title="Post a link">
              <LinkForm />
            </Card>

            <Card
              title="Sources"
              note={`${sources.filter((source) => source.enabled).length} enabled`}
              info="Where the feed comes from. A source that has failed says why, so a network problem does not look like a quiet week."
            >
              {failing.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <Note>
                    {failing.length === 1
                      ? `${failing[0]!.name} is failing: ${failing[0]!.lastError}`
                      : `${failing.length} sources are failing. Most often this is an outbound network restriction rather than the feed being down.`}
                  </Note>
                </div>
              )}

              <div className="ui-rows">
                {sources.map((source) => (
                  <div className="ui-row-card" key={source.id}>
                    <div style={{ minWidth: 0 }}>
                      <span className={`ui-status ui-status-${
                        !source.enabled ? 'off' : source.lastError ? 'error' : 'on'
                      }`}>
                        <span className="ui-status-dot" />
                        {source.homepage ? (
                          <a href={source.homepage} target="_blank" rel="noopener noreferrer">
                            {source.name}
                          </a>
                        ) : (
                          source.name
                        )}
                      </span>
                      <div className="ui-row-sub">
                        {source.category} · {source.items} items ·{' '}
                        {source.lastFetchedAt ? when(source.lastFetchedAt) : 'never fetched'}
                      </div>
                    </div>

                    {user.isAdmin && (
                      <form action={toggleSourceAction}>
                        <input type="hidden" name="id" value={source.id} />
                        <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
                          {source.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>

              {sources.length === 0 && <Empty>No sources are configured.</Empty>}
            </Card>

            <Card title="How this stays current">
              <p className="ui-muted">
                A scheduled job runs <code className="ui-code-inline">npm run news</code> and
                writes what it finds here. Nothing is fetched while you are reading, which is why
                the page loads instantly and why it can be behind. The date on the feed says how
                far.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </Shell>
  );
}
