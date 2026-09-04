import { Card, Empty, Note } from '../ui/Card';
import { Icon } from '../ui/Icons';
import { Shell } from '../ui/Shell';
import { PriorityTag, Tag } from '../ui/Tag';
import { money, plural, when } from '../ui/format';
import { actionBoard, type ActionStatus, type TrackedAction } from '../lib/recommendations';
import { cursorShellContext } from '../lib/shell';

import { setActionStatusAction } from './mutations';

/**
 * Actions: the recommendations, with somewhere to put your answer.
 *
 * Every item names the numbers that produced it, because a recommendation a reader cannot
 * argue with is a recommendation they will ignore. None of them claims a saving — the figure
 * attached is what has already been spent on the problem, which is a fact rather than a
 * prediction about how somebody will behave next week.
 */

const STATUS_LABEL: Record<ActionStatus, string> = {
  open: 'Open',
  doing: 'In progress',
  done: 'Done',
  dismissed: 'Not now',
};

function StatusButtons({ action }: { action: TrackedAction }) {
  const options: { status: ActionStatus; label: string; className: string }[] = [
    { status: 'doing', label: 'Working on it', className: 'ui-btn ui-btn-ghost ui-btn-sm' },
    { status: 'done', label: 'Done', className: 'ui-btn ui-btn-good ui-btn-sm' },
    { status: 'dismissed', label: 'Not now', className: 'ui-btn ui-btn-ghost ui-btn-sm' },
  ];

  return (
    <div className="ui-row ui-row-tight">
      {options
        .filter((option) => option.status !== action.status)
        .map((option) => (
          <form action={setActionStatusAction} key={option.status}>
            <input type="hidden" name="key" value={action.key} />
            <input type="hidden" name="status" value={option.status} />
            <button type="submit" className={option.className}>
              {option.label}
            </button>
          </form>
        ))}
      {action.status !== 'open' && (
        <form action={setActionStatusAction}>
          <input type="hidden" name="key" value={action.key} />
          <input type="hidden" name="status" value="open" />
          <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
            Reopen
          </button>
        </form>
      )}
    </div>
  );
}

function ActionCard({ action }: { action: TrackedAction }) {
  return (
    <article className={`ui-action ui-action-${action.priority}`}>
      <span className="ui-action-mark" />

      <div>
        <div className="ui-row ui-row-tight">
          <h3 className="ui-action-title">{action.title}</h3>
          <PriorityTag priority={action.priority} />
          <Tag tone={action.basis === 'measured' ? 'good' : 'warn'}>
            {action.basis === 'measured' ? 'Measured' : 'Inferred'}
          </Tag>
          {action.status !== 'open' && <Tag tone="primary">{STATUS_LABEL[action.status]}</Tag>}
        </div>

        <p className="ui-action-body">{action.detail}</p>

        <div className="ui-evidence">
          {action.evidence.map((item) => (
            <span className="ui-evidence-chip" key={item.label}>
              {item.label} <b>{item.value}</b>
            </span>
          ))}
        </div>

        <div className="ui-row ui-row-tight" style={{ marginTop: 12 }}>
          {action.href && (
            <a className="ui-btn ui-btn-primary ui-btn-sm" href={action.href}>
              {action.action}
              <Icon name="arrowRight" size={13} />
            </a>
          )}
          <StatusButtons action={action} />
        </div>

        {action.updatedAt && (
          <p className="ui-faint" style={{ marginTop: 8 }}>
            Marked {STATUS_LABEL[action.status].toLowerCase()} {when(action.updatedAt)}
          </p>
        )}
      </div>

      <div className="ui-action-side">
        {action.atStakeCents !== undefined ? (
          <div className="ui-action-savings">
            <b className="ui-money-bad">{money(action.atStakeCents)}</b>
            <span>already spent on this</span>
          </div>
        ) : (
          <div className="ui-action-savings">
            <b>—</b>
            <span>no cost attached</span>
          </div>
        )}
      </div>
    </article>
  );
}

export default async function ActionsPage() {
  const { shellUser, nav, connection, user } = await cursorShellContext();
  const board = await actionBoard(user.email);

  const counts = board.byPriority;

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="Actions"
      subtitle="What to change, derived from your own numbers rather than from advice"
    >
      <div className="ui-col">
        <Card>
          <div className="ui-spread">
            <div className="ui-row ui-row-tight">
              {(['critical', 'high', 'medium', 'optimization'] as const)
                .filter((priority) => counts[priority] > 0)
                .map((priority) => (
                  <span className="ui-evidence-chip" key={priority}>
                    {priority} <b>{counts[priority]}</b>
                  </span>
                ))}
              {board.open.length === 0 && <span className="ui-faint">Nothing open</span>}
            </div>
            <span className="ui-card-note">
              {money(board.atStakeCents)} already spent behind the open items
            </span>
          </div>
        </Card>

        {board.open.length > 0 ? (
          <div className="ui-col">
            {board.open.map((action) => (
              <ActionCard action={action} key={action.key} />
            ))}
          </div>
        ) : (
          <Card>
            <Note>
              Nothing measurable to fix. These recommendations come from rules over your Cloud
              Agent history — cache reuse, unfinished runs, agents that shipped nothing, missing
              connections — so an empty page means those checks passed rather than that nobody
              looked. It will fill in again as you run more agents.
            </Note>
          </Card>
        )}

        {board.parked.length > 0 && (
          <Card
            title="Settled"
            note={`${board.parked.length} ${plural(board.parked.length, 'item')}`}
            info="Items you marked done or set aside. They stay visible because a recommendation that quietly reappears later is worse than one that never left."
          >
            <div className="ui-rows">
              {board.parked.map((action) => (
                <div className="ui-row-card" key={action.key}>
                  <div>
                    <div className="ui-row-title">{action.title}</div>
                    <div className="ui-row-sub">
                      {STATUS_LABEL[action.status]} · {when(action.updatedAt)}
                      {action.atStakeCents !== undefined && ` · ${money(action.atStakeCents)} spent`}
                    </div>
                  </div>
                  <StatusButtons action={action} />
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <p className="ui-faint">
            <Icon name="info" size={12} /> Recommendations are recomputed on every visit from the
            Cursor, GitHub and Jira data available to your account. Nothing here is a projection:
            where a figure appears it is money already spent on the thing being described.
          </p>
        </Card>
      </div>
    </Shell>
  );
}
