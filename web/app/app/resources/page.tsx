import { Card, Empty } from '../ui/Card';
import { FilterChips, SearchBox } from '../ui/Filters';
import { Icon } from '../ui/Icons';
import { Shell } from '../ui/Shell';
import { Tag } from '../ui/Tag';
import { compact, when } from '../ui/format';
import { RESOURCE_KINDS, type ResourceKind } from '../lib/resourceKinds';
import { listResources, resourceTags, type Resource } from '../lib/resources';
import { one, shellContext, type SearchParams } from '../lib/shell';

import { ResourceForm } from './ResourceForm';
import { featureResourceAction, voteResourceAction } from './mutations';

export const metadata = { title: 'Resources · Zero Manual Coding' };

/**
 * The resource shelf: repositories, docs and tools worth reading.
 *
 * Ordered by votes with a small featured section, rather than by whoever posted last. A link
 * with no explanation of why it mattered to somebody is a bookmark; the description field is
 * what makes it a recommendation, so the empty state asks for one.
 */

const KIND_ICON: Record<ResourceKind, string> = {
  repo: 'github',
  doc: 'book',
  tool: 'cog',
  video: 'eye',
  course: 'layers',
};

function ResourceRow({ resource, canFeature }: { resource: Resource; canFeature: boolean }) {
  return (
    <div className="ui-row-card">
      <div style={{ minWidth: 0 }}>
        <div className="ui-row ui-row-tight">
          <span className="ui-kpi-icon">
            <Icon name={KIND_ICON[resource.kind]} size={13} />
          </span>
          <a
            className="ui-row-title"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {resource.title}
            <Icon name="external" size={11} />
          </a>
          {resource.featured && <Tag tone="accent">featured</Tag>}
          {resource.repoStars !== null && (
            <Tag tone="warn">
              <Icon name="star" size={10} /> {compact(resource.repoStars)}
            </Tag>
          )}
          {resource.tags.slice(0, 3).map((tag) => (
            <Tag tone="primary" key={tag}>
              {tag}
            </Tag>
          ))}
        </div>

        <p className="ui-row-sub">{resource.description ?? 'No description was given.'}</p>
        <p className="ui-faint">
          {resource.repoSlug ?? new URL(resource.url).hostname} · added by{' '}
          {resource.submittedByName} {when(resource.createdAt)}
        </p>
      </div>

      <div className="ui-row ui-row-tight">
        <form action={voteResourceAction}>
          <input type="hidden" name="id" value={resource.id} />
          <button
            type="submit"
            className="ui-react"
            data-mine={resource.votedByMe ? 'true' : 'false'}
            aria-pressed={resource.votedByMe}
            aria-label={resource.votedByMe ? 'Remove your vote' : 'Vote for this'}
          >
            <Icon name="arrowUp" size={13} />
            {resource.votes}
          </button>
        </form>

        {canFeature && (
          <form action={featureResourceAction}>
            <input type="hidden" name="id" value={resource.id} />
            <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
              {resource.featured ? 'Unfeature' : 'Feature'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default async function ResourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { shellUser, nav, connection, connections, user } = await shellContext();

  const requested = one(params.kind) as ResourceKind | undefined;
  const kind = RESOURCE_KINDS.some((entry) => entry.id === requested) ? requested : undefined;
  const tag = one(params.tag);
  const search = one(params.q);

  const [resources, tags] = await Promise.all([
    listResources(user.email, { kind, tag, search }),
    resourceTags(),
  ]);

  const featured = resources.filter((resource) => resource.featured);
  const rest = resources.filter((resource) => !resource.featured);

  const link = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries({ kind, tag, q: search, ...overrides })) {
      if (value) next.set(key, value);
    }
    const rendered = next.toString();
    return rendered ? `/app/resources?${rendered}` : '/app/resources';
  };

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="Resources"
      subtitle="Repositories, docs and tools worth your colleagues' time"
    >
      <div className="ui-col">
        <div className="ui-with-rail">
          <div className="ui-col">
            <Card>
              <div className="ui-col" style={{ gap: 10 }}>
                <SearchBox
                  action="/app/resources"
                  placeholder="Search names, descriptions and tags"
                  value={search}
                  keep={{ kind, tag }}
                />

                <FilterChips
                  options={RESOURCE_KINDS.map((entry) => ({ id: entry.id, label: entry.label }))}
                  active={kind}
                  allLabel="Everything"
                  allHref={link({ kind: undefined })}
                  hrefFor={(id) => link({ kind: id })}
                />

                {tags.length > 0 && (
                  <FilterChips
                    options={tags.map((entry) => ({ id: entry, label: entry }))}
                    active={tag}
                    allLabel="Any tag"
                    allHref={link({ tag: undefined })}
                    hrefFor={(id) => link({ tag: id })}
                  />
                )}
              </div>
            </Card>

            {featured.length > 0 && (
              <Card title="Start here" info="Picked out by an admin. Everything else is ordered by how colleagues voted.">
                <div className="ui-rows">
                  {featured.map((resource) => (
                    <ResourceRow resource={resource} canFeature={user.isAdmin} key={resource.id} />
                  ))}
                </div>
              </Card>
            )}

            <Card
              title={featured.length > 0 ? 'Everything else' : 'The shelf'}
              note={`${rest.length} ${rest.length === 1 ? 'entry' : 'entries'}`}
            >
              {rest.length > 0 ? (
                <div className="ui-rows">
                  {rest.map((resource) => (
                    <ResourceRow resource={resource} canFeature={user.isAdmin} key={resource.id} />
                  ))}
                </div>
              ) : (
                <Empty>
                  {search || kind || tag
                    ? 'Nothing matches those filters.'
                    : 'The shelf is empty. Add the repository you learned the most from — with a sentence on why, so it reads as a recommendation rather than a bookmark.'}
                </Empty>
              )}
            </Card>
          </div>

          <aside className="ui-rail">
            <Card title="Add something">
              <ResourceForm hasGitHub={Boolean(connections.github)} />
            </Card>

            <Card title="What belongs here">
              <ul className="ui-list">
                <li>Repositories worth reading, not just using.</li>
                <li>Documentation that changed how you work rather than what you typed.</li>
                <li>Tools that fit alongside Cursor.</li>
                <li>
                  Anything you found yourself sending to two different colleagues — that is the
                  signal it should be here instead.
                </li>
              </ul>
            </Card>
          </aside>
        </div>

        <Card>
          <p className="ui-faint">
            <Icon name="info" size={12} /> Star counts are looked up once when a link is added,
            using the GitHub token of whoever added it. A missing count means the lookup never
            ran, not that the repository has no stars.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
