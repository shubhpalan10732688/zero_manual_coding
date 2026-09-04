import { Card, Empty, KeyValues, Note } from './ui/Card';
import { BarList, ChartTabs, TrendChart } from './ui/Charts';
import { Icon } from './ui/Icons';
import { KpiRow, StatTile } from './ui/Kpi';
import { PeriodNote, Shell } from './ui/Shell';
import { CellStack, DataTable } from './ui/Table';
import { Tag } from './ui/Tag';
import { compact, count, durationFromMs, money, percent, plural, when } from './ui/format';
import { periodDays, periodLabel, resolvePeriod } from './ui/nav';
import type { Kpi, Trend, TrendBoard } from './ui/types';
import { boardFeed } from './lib/board';
import {
  dailyActivity,
  editorWeeks,
  lifetimeSummary,
  periodTotals,
  recentRuns,
  repoActivity,
  topAgents,
  type AgentRow,
  type RunRow,
} from './lib/metrics';
import { actionBoard } from './lib/recommendations';
import { cursorShellContext, one, type SearchParams } from './lib/shell';

/**
 * The dashboard.
 *
 * What it shows depends on what is connected, and it says which. Cloud Agent figures come
 * from the reader's own Cursor key and are always available once they have signed in. Merge
 * state needs GitHub, ticket type needs Jira, and in-editor activity needs the Team Admin
 * ingest that no personal key can substitute for. Where a source is missing the panel says
 * so instead of rendering zeros, because a zero here reads as "you did nothing" when the
 * truth is "nobody asked".
 */

function trend(current: number, previous: number, basis: string, riseIsGood = true): Trend | undefined {
  if (previous <= 0) return undefined;
  return { change: (current - previous) / previous, basis, riseIsGood };
}

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const days = periodDays(period);

  const { shellUser, nav, connection, connections, user } = await cursorShellContext();

  const [now, before, lifetime, daily, agents, runs, repos, weeks, actions, posts] =
    await Promise.all([
      periodTotals(user.email, days),
      periodTotals(user.email, days, 1),
      lifetimeSummary(user.email),
      dailyActivity(user.email, days),
      topAgents(user.email, days, 6),
      recentRuns(user.email, 8),
      repoActivity(user.email, 6),
      editorWeeks(user.email, 8),
      actionBoard(user.email),
      boardFeed(user.email, {}, 3),
    ]);

  const basis = `vs previous ${days} days`;

  const kpis: Kpi[] = [
    {
      id: 'spend',
      label: 'Agent spend',
      value: money(now.rawCostCents),
      hint: 'What your Cloud Agent runs cost at list price in this period, before any subscription credit.',
      icon: 'coin',
      trend: trend(now.rawCostCents, before.rawCostCents, basis, false),
      href: `/app/impact?period=${period}`,
      extra: lifetime
        ? {
            label: 'Absorbed by your subscription, all time',
            value: money(lifetime.subscriptionAbsorbedCents),
          }
        : undefined,
    },
    {
      id: 'runs',
      label: 'Runs',
      value: count(now.runs),
      unit: `across ${now.agents} ${plural(now.agents, 'agent')}`,
      hint: 'One run is one turn of a Cloud Agent. An agent usually has several.',
      icon: 'bolt',
      trend: trend(now.runs, before.runs, basis),
      href: `/app/impact?period=${period}`,
    },
    {
      id: 'cache',
      label: 'Cache reuse',
      value: now.cacheReuseRate === null ? '—' : percent(now.cacheReuseRate),
      hint: 'Cache reads as a share of all context traffic. Higher means your runs inherit context instead of rebuilding it, which costs materially less.',
      icon: 'repeat',
      trend:
        now.cacheReuseRate !== null && before.cacheReuseRate
          ? trend(now.cacheReuseRate, before.cacheReuseRate, basis)
          : undefined,
      href: `/app/actions`,
      extra: {
        label: 'Spent on cold starts',
        value: money(now.coldStartCents),
      },
    },
    {
      id: 'shipped',
      label: 'Pull requests',
      value: count(now.pullRequests),
      hint: connections.github
        ? 'Distinct pull requests opened by your agents in this period, with merge state read from GitHub.'
        : 'Distinct pull requests opened by your agents. Connect GitHub to see which of them merged.',
      icon: 'branch',
      trend: trend(now.pullRequests, before.pullRequests, basis),
      href: `/app/impact?period=${period}`,
      extra: connections.github
        ? undefined
        : { label: 'Merge state', value: 'GitHub not connected' },
    },
  ];

  const board: TrendBoard = {
    points: daily.map((point) => ({
      label: point.day,
      values: {
        runs: point.runs,
        cost: point.rawCostCents,
        tokens: point.totalTokens,
      },
    })),
    tabs: [
      {
        id: 'runs',
        label: 'Runs',
        series: [{ key: 'runs', label: 'Runs', color: 'var(--ui-primary)', format: 'count' }],
      },
      {
        id: 'cost',
        label: 'Cost',
        series: [{ key: 'cost', label: 'Cost', color: 'var(--ui-accent)', format: 'money' }],
      },
      {
        id: 'tokens',
        label: 'Tokens',
        series: [{ key: 'tokens', label: 'Tokens', color: 'var(--ui-good)', format: 'tokens' }],
      },
    ],
  };

  const tabParam = one(params.tab);
  const tab = board.tabs.find((entry) => entry.id === tabParam)?.id ?? 'runs';

  const agentColumns = [
    {
      key: 'agent',
      header: 'Agent',
      render: (row: AgentRow) => (
        <CellStack main={row.name ?? row.id} sub={`${row.repo} · ${when(row.createdAt)}`} />
      ),
    },
    {
      key: 'runs',
      header: 'Runs',
      numeric: true,
      render: (row: AgentRow) => `${row.finishedRuns}/${row.runs}`,
    },
    {
      key: 'cache',
      header: 'Cache',
      numeric: true,
      render: (row: AgentRow) => (row.cacheReuseRate === null ? '—' : percent(row.cacheReuseRate)),
    },
    {
      key: 'time',
      header: 'Time',
      numeric: true,
      render: (row: AgentRow) => durationFromMs(row.totalDurationMs),
    },
    {
      key: 'pr',
      header: 'PR',
      numeric: true,
      render: (row: AgentRow) =>
        row.pullRequests > 0 ? <Tag tone="good">{row.pullRequests}</Tag> : <Tag>none</Tag>,
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      render: (row: AgentRow) => money(row.rawCostCents),
    },
  ];

  const runColumns = [
    {
      key: 'run',
      header: 'Run',
      render: (row: RunRow) => (
        <CellStack
          main={row.agentName ?? row.id}
          sub={[row.repo, row.branch].filter(Boolean).join(' · ') || 'no repository'}
        />
      ),
    },
    { key: 'at', header: 'When', render: (row: RunRow) => row.createdAt },
    {
      key: 'status',
      header: 'Status',
      render: (row: RunRow) => <Tag tone={row.status === 'FINISHED' ? 'good' : 'warn'}>{row.status ?? 'unknown'}</Tag>,
    },
    {
      key: 'start',
      header: 'Start',
      render: (row: RunRow) =>
        row.isColdStart ? <Tag tone="warn">cold</Tag> : <Tag tone="good">warm</Tag>,
    },
    {
      key: 'tokens',
      header: 'Tokens',
      numeric: true,
      render: (row: RunRow) => compact(row.totalTokens),
    },
    { key: 'cost', header: 'Cost', numeric: true, render: (row: RunRow) => money(row.rawCostCents) },
  ];

  const editorTotals = weeks.reduce(
    (sum, week) => ({
      tabs: sum.tabs + week.tabsAccepted,
      lines: sum.lines + week.acceptedLinesAdded,
      chats: sum.chats + week.chatRequests + week.composerRequests + week.agentRequests,
      activeDays: sum.activeDays + week.activeDays,
    }),
    { tabs: 0, lines: 0, chats: 0, activeDays: 0 },
  );

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title={`Hello, ${user.name.split(' ')[0]}`}
      subtitle="Your AI coding work: what it cost, what it shipped, and what to do next"
      period={period}
      showPeriod
    >
      <div className="ui-col">
        <KpiRow kpis={kpis} />

        {now.runs === 0 && (
          <Card>
            <Note>
              No Cloud Agent runs in {periodLabel(period).toLowerCase()}. Everything above is
              measured from the Cursor API using your own key, so a quiet period here means the
              agents were quiet — work you did in the editor is not visible to a personal key.
              Widen the period, or read the wall to see what colleagues have been achieving.
            </Note>
          </Card>
        )}

        <div className="ui-with-rail">
          <div className="ui-col">
            {board.points.length > 1 ? (
              <Card
                title="Activity"
                note={periodLabel(period)}
                info="Cloud Agent runs, cost and token traffic per day, read from the Cursor API. Hover any day for its values."
                header={
                  <ChartTabs
                    board={board}
                    activeTab={tab}
                    hrefFor={(id) => `/app?period=${period}&tab=${id}`}
                  />
                }
                action="Open Impact"
                actionHref={`/app/impact?period=${period}`}
              >
                <TrendChart board={board} activeTab={tab} />
              </Card>
            ) : (
              <Card title="Activity" note={periodLabel(period)}>
                <Empty>Not enough days with activity to draw a trend yet.</Empty>
              </Card>
            )}

            <Card
              title="This period"
              note={periodLabel(period)}
              info="Totals for the selected window, counted from individual runs rather than from your all-time summary."
            >
              <div className="ui-grid ui-grid-5">
                <StatTile
                  label="Tokens"
                  value={compact(now.totalTokens)}
                  spark={daily.map((point) => point.totalTokens)}
                  hint="input, output and cache"
                />
                <StatTile
                  label="Agent time"
                  value={durationFromMs(now.durationMs)}
                  hint="wall clock across runs"
                />
                <StatTile
                  label="Cold starts"
                  value={`${now.coldStartRuns} of ${now.runs}`}
                  hint={`${money(now.coldStartCents)} spent`}
                  href="/app/actions"
                />
                <StatTile
                  label="Unfinished"
                  value={`${now.unfinishedRuns} of ${now.runs}`}
                  hint={`${money(now.unfinishedCents)} spent`}
                  href="/app/actions"
                />
                <StatTile
                  label="Charged"
                  value={money(now.chargedCents)}
                  hint="after subscription credit"
                  href={`/app/impact?period=${period}`}
                />
              </div>
            </Card>

            <Card
              title="Costliest agents"
              note={periodLabel(period)}
              info="Your agents ranked by spend. An agent with many runs and no pull request is usually a task that needed restating rather than rerunning."
              action="Open Impact"
              actionHref={`/app/impact?period=${period}`}
            >
              <DataTable
                columns={agentColumns}
                rows={agents}
                rowKey={(row) => row.id}
                rowHref={(row) => row.agentUrl ?? undefined}
                empty="No agents ran in this period."
              />
            </Card>

            <div className="ui-grid ui-grid-2">
              <Card
                title="Where the work happened"
                info="Repositories your agents touched, by spend. Read from the run's repository URL."
              >
                {repos.length > 0 ? (
                  <BarList
                    items={repos.map((repo) => ({
                      label: repo.repo,
                      value: repo.rawCostCents,
                      display: money(repo.rawCostCents),
                    }))}
                  />
                ) : (
                  <Empty>No repository is recorded against your runs yet.</Empty>
                )}
              </Card>

              <Card
                title="In the editor"
                info="Tab completions, accepted lines and chat requests. This comes from the Cursor Team Admin ingest, which a personal key cannot read."
              >
                {weeks.length > 0 ? (
                  <>
                    <KeyValues
                      items={[
                        { label: 'Tabs accepted', value: count(editorTotals.tabs) },
                        { label: 'Lines accepted', value: count(editorTotals.lines) },
                        { label: 'Chat, composer and agent requests', value: count(editorTotals.chats) },
                        { label: 'Active days', value: `${editorTotals.activeDays} over ${weeks.length} weeks` },
                      ]}
                    />
                    <Note>
                      Measured across the last {weeks.length} {plural(weeks.length, 'week')} of team
                      usage data.
                    </Note>
                  </>
                ) : (
                  <Note>
                    Nothing here yet. In-editor activity is only visible when this dashboard has a
                    Cursor Team Admin key, which is an organisation-level setting rather than
                    something you can connect yourself. Your Cloud Agent figures above are
                    unaffected.
                  </Note>
                )}
              </Card>
            </div>

            <Card
              title="Recent runs"
              info="Your last few Cloud Agent runs, newest first, with whether each one started from a warm cache."
              action="Open Impact"
              actionHref={`/app/impact?period=${period}`}
            >
              <DataTable
                columns={runColumns}
                rows={runs}
                rowKey={(row) => row.id}
                empty="No runs recorded against your key yet."
              />
            </Card>
          </div>

          <aside className="ui-rail">
            <div className="ui-rail-head">
              <span className="ui-rail-title">
                <Icon name="bolt" size={14} /> What to do next
              </span>
              <span className="ui-rail-sub">
                {actions.open.length > 0
                  ? `${actions.open.length} open, ${money(actions.atStakeCents)} already spent behind them`
                  : 'Nothing needs your attention'}
              </span>
            </div>

            {actions.open.slice(0, 4).map((action) => (
              <a className={`ui-opp ui-opp-${action.priority}`} href="/app/actions" key={action.key}>
                <div className="ui-opp-head">
                  <span className="ui-opp-icon">
                    <Icon name="target" size={13} />
                  </span>
                  <span className="ui-opp-title">{action.title}</span>
                </div>
                <p className="ui-opp-body">{action.detail}</p>
                {action.atStakeCents !== undefined && (
                  <div className="ui-opp-metrics">
                    <span className="ui-opp-metric">
                      <b className="ui-money-bad">{money(action.atStakeCents)}</b>
                      <span>already spent</span>
                    </span>
                  </div>
                )}
              </a>
            ))}

            {actions.open.length === 0 && (
              <Empty>
                Nothing measurable to fix right now. That is a real result, not an empty state.
              </Empty>
            )}

            <div className="ui-rail-head" style={{ marginTop: 6 }}>
              <span className="ui-rail-title">
                <Icon name="award" size={14} /> From the wall
              </span>
              <span className="ui-rail-sub">What colleagues achieved with AI</span>
            </div>

            {posts.length > 0 ? (
              posts.map((post) => (
                <a className="ui-article" href={`/app/board/${post.id}`} key={post.id}>
                  <span className="ui-article-title">{post.title}</span>
                  <span className="ui-article-meta">
                    <span>{post.authorName}</span>
                    <span>{when(post.happenedOn)}</span>
                    {post.timeSavedDays !== null && <span>~{post.timeSavedDays}d saved</span>}
                  </span>
                </a>
              ))
            ) : (
              <Empty>
                The wall is empty. <a href="/app/board/new">Share the first achievement</a>.
              </Empty>
            )}
          </aside>
        </div>

        <Card>
          <div className="ui-spread">
            <p className="ui-faint">
              <Icon name="info" size={12} /> Cost, runs and cache figures are read from the Cursor
              API. Merge state comes from GitHub and ticket type from Jira, where you have
              connected them. Nothing on this page is estimated.
            </p>
            <span className="ui-row ui-row-tight">
              <PeriodNote
                period={period}
                extra={
                  lifetime?.lastAgentAt ? `last agent ${when(lifetime.lastAgentAt)}` : 'no agents yet'
                }
              />
            </span>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
