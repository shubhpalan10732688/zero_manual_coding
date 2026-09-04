import { Card, Note } from '../ui/Card';
import { FilterChips, SearchBox } from '../ui/Filters';
import { Icon } from '../ui/Icons';
import { Shell } from '../ui/Shell';
import { Tag } from '../ui/Tag';
import { count, initials, plural, when } from '../ui/format';
import { assetCategories, categoriesFor, listAssets, type Asset, type AssetKind } from '../lib/library';
import { one, shellContext } from '../lib/shell';

import { AssetForm } from './AssetForm';
import { voteAssetAction } from './mutations';

/**
 * The shared library, for either kind.
 *
 * Ranked by votes rather than by an editor's judgement, because the useful question is
 * "which of these did colleagues find worth keeping" and only they can answer it. Author
 * names are prominent for the same reason: people take the command the person who reviews
 * their code wrote.
 */

const COPY: Record<AssetKind, { title: string; subtitle: string; blurb: string; add: string }> = {
  command: {
    title: 'Commands',
    subtitle: 'Prompts your colleagues wrote, ready to copy into your own repository',
    blurb:
      'A command is a prompt you run often enough to be tired of retyping. Cursor keeps them in .cursor/commands as plain Markdown, so sharing one is copying a file.',
    add: 'Write a command',
  },
  rule: {
    title: 'Rules',
    subtitle: 'The conventions this organisation has actually written down',
    blurb:
      'A rule is a standing instruction Cursor keeps in context. Cursor reads them from .cursor/rules as .mdc files with front matter, which is exactly what the copy button gives you.',
    add: 'Write a rule',
  },
};

function VoteButton({ asset }: { asset: Asset }) {
  return (
    <form action={voteAssetAction}>
      <input type="hidden" name="id" value={asset.id} />
      <button
        type="submit"
        className="ui-react"
        data-mine={asset.votedByMe ? 'true' : 'false'}
        aria-pressed={asset.votedByMe}
        aria-label={asset.votedByMe ? 'Remove your vote' : 'Vote for this'}
      >
        <Icon name="arrowUp" size={13} />
        {asset.votes}
      </button>
    </form>
  );
}

export async function LibraryView({
  kind,
  params,
}: {
  kind: AssetKind;
  params: Record<string, string | string[] | undefined>;
}) {
  const { shellUser, nav, connection, user } = await shellContext();

  const base = kind === 'command' ? '/app/commands' : '/app/rules';
  const category = one(params.category);
  const search = one(params.q);
  const sort = one(params.sort) === 'recent' ? 'recent' : 'popular';
  const mine = one(params.mine) === '1';

  const [assets, categories] = await Promise.all([
    listAssets(user.email, kind, { category, search, sort, mine }),
    assetCategories(kind),
  ]);

  const copy = COPY[kind];
  const link = (overrides: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      category,
      q: search,
      sort: sort === 'popular' ? undefined : sort,
      mine: mine ? '1' : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const rendered = next.toString();
    return rendered ? `${base}?${rendered}` : base;
  };

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title={copy.title}
      subtitle={copy.subtitle}
      headerExtra={
        <a className="ui-btn ui-btn-primary" href={`${base}/new`}>
          <Icon name="plus" size={14} />
          {copy.add}
        </a>
      }
    >
      <div className="ui-col">
        <Card>
          <Note>
            <Icon name="info" size={12} /> {copy.blurb} Cursor has no API for team {kind}s, so
            this catalogue is ours: written here, copied out by hand, and attributed.
          </Note>
        </Card>

        <Card>
          <div className="ui-col" style={{ gap: 10 }}>
            <SearchBox
              action={base}
              placeholder={`Search ${kind}s by name, description or content`}
              value={search}
              keep={{ category, sort: sort === 'popular' ? undefined : sort }}
            />

            <FilterChips
              options={categories.map((entry) => ({
                id: entry.category,
                label: entry.category,
                count: entry.count,
              }))}
              active={category}
              allLabel="Every category"
              allHref={link({ category: undefined })}
              hrefFor={(id) => link({ category: id })}
            />

            <div className="ui-filters">
              <a className="ui-chip" href={link({ sort: undefined })} aria-current={sort === 'popular' ? 'true' : undefined}>
                Most voted
              </a>
              <a className="ui-chip" href={link({ sort: 'recent' })} aria-current={sort === 'recent' ? 'true' : undefined}>
                Newest
              </a>
              <a
                className="ui-chip"
                href={link({ mine: mine ? undefined : '1' })}
                aria-current={mine ? 'true' : undefined}
              >
                Mine, including drafts
              </a>
            </div>
          </div>
        </Card>

        {assets.length > 0 ? (
          <div className="ui-rows">
            {assets.map((asset) => (
              <div className="ui-row-card" key={asset.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="ui-row ui-row-tight">
                    <a className="ui-row-title" href={`${base}/${asset.slug}`}>
                      {asset.title}
                    </a>
                    <Tag tone="blue">{asset.category}</Tag>
                    {asset.status !== 'published' && <Tag tone="warn">{asset.status}</Tag>}
                    {asset.tags.slice(0, 3).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                  <p className="ui-row-sub">
                    {asset.description ?? 'No description.'}
                  </p>
                  <p className="ui-faint">
                    <span className="ui-avatar-sm" style={{ width: 18, height: 18, fontSize: 9 }}>
                      {initials(asset.authorName, '?')}
                    </span>{' '}
                    {asset.authorName} · updated {when(asset.updatedAt)} · {count(asset.copies)}{' '}
                    {plural(asset.copies, 'copy', 'copies')}
                  </p>
                </div>

                <div className="ui-row ui-row-tight">
                  <VoteButton asset={asset} />
                  <a className="ui-btn ui-btn-ghost ui-btn-sm" href={`${base}/${asset.slug}`}>
                    Open
                    <Icon name="chevronRight" size={12} />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <Note>
              {search || category || mine
                ? 'Nothing matches. Clear the filters to see everything.'
                : `Nobody has shared a ${kind} yet. Whatever you retype into Cursor every week is the one to start with — it is already proven, it just is not written down.`}
            </Note>
            <div className="ui-row" style={{ marginTop: 12 }}>
              <a className="ui-btn ui-btn-primary" href={`${base}/new`}>
                <Icon name="plus" size={14} />
                {copy.add}
              </a>
            </div>
          </Card>
        )}

        {assets.length > 0 && (
          <Card>
            <p className="ui-faint">
              <Icon name="info" size={12} /> Copy counts record that somebody took a{' '}
              {kind} from this page. What they did with it afterwards happens in their own
              repository, where we cannot see it.
            </p>
          </Card>
        )}
      </div>
    </Shell>
  );
}

/** The authoring page, shared by both kinds. */
export async function NewAssetView({ kind }: { kind: AssetKind }) {
  const { shellUser, nav, connection } = await shellContext();
  const base = kind === 'command' ? '/app/commands' : '/app/rules';

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title={COPY[kind].add}
      subtitle={
        kind === 'command'
          ? 'A prompt worth running more than once'
          : 'A convention worth stating once instead of repeating in review'
      }
    >
      <div className="ui-col">
        <div className="ui-breadcrumb">
          <a href={base}>{COPY[kind].title}</a>
          <span className="ui-breadcrumb-sep">/</span>
          <span>New</span>
        </div>

        <Card title="The details">
          <AssetForm kind={kind} categories={categoriesFor(kind)} />
        </Card>

        <Card title="What makes one worth sharing">
          <ul className="ui-list">
            {kind === 'command' ? (
              <>
                <li>It states the output format, so the answer is usable without a follow-up.</li>
                <li>It says what to check rather than asking for a general opinion.</li>
                <li>It is something you have actually run, not something you think should work.</li>
              </>
            ) : (
              <>
                <li>It is an instruction, not a description of team culture.</li>
                <li>It is scoped to the files it applies to, so it does not fire everywhere.</li>
                <li>
                  It replaces a comment you have left in review more than twice — that is the
                  test for whether a rule is needed at all.
                </li>
              </>
            )}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
