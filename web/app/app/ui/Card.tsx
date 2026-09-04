import type { ReactNode } from 'react';

import { Icon } from './Icons';

/**
 * The container every panel uses. `action` is the drill-down affordance the brief requires
 * on each dashboard region, so it sits in the header rather than being repeated per page.
 */
export function Card({
  title,
  note,
  info,
  action,
  actionHref,
  header,
  children,
  className,
}: {
  title?: string;
  note?: string;
  /** Explains what the panel measures, shown on the header's help affordance. */
  info?: string;
  action?: string;
  actionHref?: string;
  /** Extra controls placed between the title and the action, e.g. chart tabs. */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const showHead = title || note || action || header;

  return (
    <section className={className ? `ui-card ${className}` : 'ui-card'}>
      {showHead && (
        <div className="ui-card-head">
          {title && (
            <h2 className="ui-card-title">
              {title}
              {info && (
                <span className="ui-info" title={info} role="img" aria-label={info}>
                  ?
                </span>
              )}
            </h2>
          )}
          {note && <span className="ui-card-note">{note}</span>}
          {header}
          {action && actionHref && (
            <a className="ui-card-action" href={actionHref}>
              {action}
              <Icon name="chevronRight" size={12} />
            </a>
          )}
          {action && !actionHref && <span className="ui-card-action">{action}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="ui-empty">{children}</p>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="ui-note">{children}</p>;
}

/** A labelled figure list, used for the smaller summary panels. */
export function KeyValues({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="ui-kv">
      {items.map((item) => (
        <div key={item.label} style={{ display: 'contents' }}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
