import { Card, Empty, KeyValues, Note } from '../ui/Card';
import { BarList, ShareBar } from '../ui/Charts';
import { Icon } from '../ui/Icons';
import { KpiRow } from '../ui/Kpi';
import { PeriodNote, Shell } from '../ui/Shell';
import { CellStack, DataTable } from '../ui/Table';
import { ConfidenceNote, Tag } from '../ui/Tag';
import { compact, count, days as formatDays, money, percent, plural } from '../ui/format';
import { periodDays, periodLabel, resolvePeriod } from '../ui/nav';
import type { Kpi } from '../ui/types';
import { boardTotals } from '../lib/board';
import {
  impactByTicket,
  impactByType,
  impactSummary,
  lifetimeSummary,
  periodTotals,
  unticketedAgents,
  type TicketImpact,
  type UnticketedAgent,
} from '../lib/metrics';
import { cursorShellContext, type SearchParams } from '../lib/shell';

/**
 * Impact: what the money bought.
 *
 * Two kinds of figure share this page and they are never mixed. Cost, merge state and ticket
 * type are measured — Cursor, GitHub and Jira were asked. Days saved is self-reported by
 * whoever wrote the board post, and is labelled as such everywhere it appears. Putting them
 * side by side is the point: a reader can see what the organisation spent against what the
 * people who did the work believe they got, without the page pretending the second number
 * has the standing of the first.
 */

const WORK_TYPE_COLORS: Record<string, string> = {
  feature: 'var(--ui-blue)',
  bug: 'var(--ui-bad)',
  chore: 'var(--ui-violet)',
  unknown: 'var(--ui-surface-3)',
};

export default async function ImpactPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const period = resolvePeriod(params.period);
  const days = periodDays(period);

  const { shellUser, nav, connection, connections, user } = await cursorShellContext();

  const [impact, lifetime, now, tickets, byType, unticketed, board] = await Promise.all([
    impactSummary(user.email),
    lifetimeSummary(user.email),
    periodTotals(user.email, days),
    impactByTicket(user.email),
    impactByType(user.email),
    unticketedAgents(user.email, 12),
    boardTotals(),
  ]);

  const shippedShare =
    impact && impact.agents > 0 ? impact.shippedAgents / impact.agents : null;

  const kpis: Kpi[] = [
    {
      id: 'spend',
      label: 'Spend in period',
      value: money(now.rawCostCents),
      hint: 'List-price cost of your Cloud Agent runs in this window, read from the Cursor API.',
      icon: 'coin',
      extra: lifetime
        ? { label: 'All time', value: money(lifetime.rawCostCents) }
        : undefined,
    },
    {
      id: 'shipped',
      label: 'Agents that shipped',
      value: impact ? `${impact.shippedAgents} of ${impact.agents}` : '—',
      unit: shippedShare !== null ? percent(shippedShare) : undefined,
      hint: connections.github
        ? 'Agents whose pull request was merged, read from GitHub.'
        : 'Agents that opened a pull request. Without GitHub connected, merged and abandoned cannot be told apart.',
      icon: 'branch',
      href: '/app/connections',
    },
    {
      id: 'attributed',
      label: 'Traced to a ticket',
      value: impact ? `${impact.tickets}` : '—',
      unit: impact ? plural(impact.tickets, 'ticket') : undefined,
      hint: 'Tickets matched by finding their key in a branch name or pull request title. Work with neither stays unattributed however good the Jira connection is.',
      icon: 'ticket',
      extra: impact
        ? { label: 'Agents with no ticket', value: count(impact.unclassifiedAgents) }
        : undefined,
    },
    {
      id: 'reported',
      label: 'Days saved, self-reported',
      value: formatDays(board.daysSaved),
      unit: 'across the org',
      hint: 'Summed from Zero Manual Coding board posts. Written by the people who did the work and verified by nothing.',
      icon: 'award',
      href: '/app/board',
      extra: {
        label: 'Posts carrying a figure',
        value: `${board.postsWithDays} of ${board.posts}`,
      },
    },
  ];

  const ticketColumns = [
    {
      key: 'ticket',
      header: 'Ticket',
      render: (row: TicketImpact) => (
        <CellStack
          main={`${row.ticketKey}${row.summary ? ` · ${row.summary}` : ''}`}
          sub={[row.ticketType, row.ticketStatus].filter(Boolean).join(' · ') || 'type unknown'}
        />
      ),
    },
    {
      key: 'type',
      header: 'Work',
      render: (row: TicketImpact) => <Tag tone="blue">{row.workType}</Tag>,
    },
    { key: 'agents', header: 'Agents', numeric: true, render: (row: TicketImpact) => row.agents },
    {
      key: 'shipped',
      header: 'Shipped',
      numeric: true,
      render: (row: TicketImpact) => `${row.shippedAgents}/${row.agents}`,
    },
    {
      key: 'diff',
      header: 'Lines',
      numeric: true,
      render: (row: TicketImpact) =>
        row.additions + row.deletions > 0
          ? `+${compact(row.additions)} / -${compact(row.deletions)}`
          : '—',
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      render: (row: TicketImpact) => money(row.rawCostCents),
    },
  ];

  const unticketedColumns = [
    {
      key: 'agent',
      header: 'Agent',
      render: (row: UnticketedAgent) => (
        <CellStack main={row.agentName ?? row.agentId} sub={row.summary ?? 'no summary'} />
      ),
    },
    { key: 'runs', header: 'Runs', numeric: true, render: (row: UnticketedAgent) => row.runs },
    {
      key: 'pr',
      header: 'Pull request',
      render: (row: UnticketedAgent) =>
        row.prUrl ? (
          <Tag tone={row.prMerged ? 'good' : 'warn'}>{row.prMerged ? 'merged' : 'open'}</Tag>
        ) : (
          <Tag>none</Tag>
        ),
    },
    {
      key: 'cost',
      header: 'Cost',
      numeric: true,
      render: (row: UnticketedAgent) => money(row.rawCostCents),
    },
  ];

  const typeSegments = byType
    .filter((entry) => entry.rawCostCents > 0)
    .map((entry) => ({
      label: entry.workType,
      value: entry.rawCostCents,
      color: WORK_TYPE_COLORS[entry.workType] ?? 'var(--ui-warn)',
      display: money(entry.rawCostCents),
    }));

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="Impact"
      subtitle="What the spend bought, and how much of that can be proven"
      period={period}
      showPeriod
    >
      <div className="ui-col">
        <KpiRow kpis={kpis} />

        {!connections.github && (
          <Card>
            <Note>
              GitHub is not connected, so this page can tell you that a pull request was opened
              but not whether anyone merged it. That single fact is the difference between
              shipped work and abandoned work.{' '}
              <a href="/app/connections">Connect GitHub</a> and the figures fill in from your
              existing history, not just from new runs.
            </Note>
          </Card>
        )}

        <div className="ui-grid ui-grid-2">
          <Card
            title="Cost by work type"
            info="Ticket type as Jira reports it, mapped onto feature, bug and chore. Agents with no matched ticket sit in unknown."
          >
            {typeSegments.length > 0 ? (
              <>
                <ShareBar segments={typeSegments} />
                <div style={{ marginTop: 14 }}>
                  <KeyValues
                    items={byType.map((entry) => ({
                      label: `${entry.workType} — ${entry.shippedAgents} of ${entry.agents} shipped`,
                      value:
                        entry.centsPerShipped !== null
                          ? `${money(entry.centsPerShipped)} per shipped agent`
                          : 'nothing shipped yet',
                    }))}
                  />
                </div>
              </>
            ) : (
              <Empty>
                No cost has been attributed to a work type yet.
                {!connections.jira && (
                  <>
                    {' '}
                    <a href="/app/connections">Connect Jira</a> to classify it.
                  </>
                )}
              </Empty>
            )}
          </Card>

          <Card
            title="Where the money went"
            info="The two things worth separating: work that reached a merged pull request, and work that did not."
          >
            {impact ? (
              <>
                <BarList
                  items={[
                    {
                      label: 'Shipped',
                      value: Math.max(impact.rawCostCents - impact.unshippedCents, 0),
                      display: money(Math.max(impact.rawCostCents - impact.unshippedCents, 0)),
                      color: 'var(--ui-good)',
                    },
                    {
                      label: 'Open, not merged',
                      value: impact.unmergedPrCents,
                      display: money(impact.unmergedPrCents),
                      color: 'var(--ui-warn)',
                    },
                    {
                      label: 'No pull request',
                      value: Math.max(impact.unshippedCents - impact.unmergedPrCents, 0),
                      display: money(Math.max(impact.unshippedCents - impact.unmergedPrCents, 0)),
                      color: 'var(--ui-bad)',
                    },
                  ]}
                />
                <div style={{ marginTop: 14 }}>
                  <KeyValues
                    items={[
                      { label: 'Lines added by agents', value: `+${compact(impact.additions)}` },
                      { label: 'Lines removed', value: `-${compact(impact.deletions)}` },
                      {
                        label: 'Agents waiting on review',
                        value: `${impact.unmergedPrAgents} (${money(impact.unmergedPrCents)})`,
                      },
                    ]}
                  />
                </div>
                <ConfidenceNote
                  level={connections.github ? 'measured' : 'medium'}
                  basis={
                    connections.github
                      ? 'Merge state read from the GitHub API for each pull request.'
                      : 'Read from Cursor only. Without GitHub, an open pull request and a merged one look the same.'
                  }
                />
              </>
            ) : (
              <Empty>Nothing to attribute yet.</Empty>
            )}
          </Card>
        </div>

        <Card
          title="By ticket"
          info="Every ticket your agents touched, ranked by cost. Matched by ticket key in a branch name or pull request title."
          note={`${tickets.length} ${plural(tickets.length, 'ticket')}`}
        >
          <DataTable
            columns={ticketColumns}
            rows={tickets}
            rowKey={(row) => row.ticketKey}
            empty={
              connections.jira
                ? 'No agent work has been matched to a ticket. Naming branches after the ticket fixes this for everything you run afterwards.'
                : 'Connect Jira to see which tickets your agent work belongs to.'
            }
          />
        </Card>

        <Card
          title="Unattributed agents"
          info="Agent work whose branch and pull request carried no recognisable ticket key. The cost is real; only the attribution is missing."
          note="Ranked by cost"
        >
          <DataTable
            columns={unticketedColumns}
            rows={unticketed}
            rowKey={(row) => row.agentId}
            empty="Everything your agents did is traceable to a ticket."
          />
        </Card>

        <Card>
          <div className="ui-spread">
            <p className="ui-faint">
              <Icon name="info" size={12} /> Cost and merge state are measured. Days saved is
              written by the person who did the work and is never combined with a measured
              figure.
            </p>
            <span className="ui-row ui-row-tight">
              <PeriodNote
                period={period}
                extra={`${board.posts} board ${plural(board.posts, 'post')} · ${periodLabel(period).toLowerCase()}`}
              />
            </span>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
