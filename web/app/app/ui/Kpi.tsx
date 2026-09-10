import type { Kpi } from './types';
import { ScoreDial, Sparkline } from './Charts';
import { Icon } from './Icons';
import { Delta } from './Tag';

/**
 * A dashboard KPI. Each one carries its trend, an explanation of what it measures and a
 * drill-down target, because the brief requires every summary metric to open its detail.
 */
export function KpiCard({ kpi, dial = false }: { kpi: Kpi; dial?: boolean }) {
  const body = (
    <>
      <div className="ui-kpi-head">
        <span className="ui-kpi-label">{kpi.label}</span>
        <span className="ui-info" title={kpi.hint} role="img" aria-label={kpi.hint}>
          ?
        </span>
        {kpi.icon && (
          <span className="ui-kpi-icon">
            <Icon name={kpi.icon} size={14} />
          </span>
        )}
      </div>

      <div className="ui-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="ui-kpi-value">
            {kpi.value}
            {kpi.unit && <span className="ui-kpi-unit"> {kpi.unit}</span>}
          </div>
          {kpi.trend && (
            <div className="ui-kpi-foot">
              <Delta trend={kpi.trend} />
            </div>
          )}
        </div>
        {dial && kpi.score !== undefined && <ScoreDial value={kpi.score} size={58} caption="" />}
      </div>

      {kpi.extra && (
        <div className="ui-kpi-extra">
          {kpi.extra.label}
          <br />
          <strong>{kpi.extra.value}</strong>
        </div>
      )}
    </>
  );

  if (kpi.href) {
    return (
      <a className="ui-kpi" href={kpi.href}>
        {body}
      </a>
    );
  }
  return <article className="ui-kpi">{body}</article>;
}

export function KpiRow({ kpis, dialFor }: { kpis: Kpi[]; dialFor?: string[] }) {
  return (
    <div className={`ui-grid ui-grid-${Math.min(kpis.length, 4)}`}>
      {kpis.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} dial={dialFor?.includes(kpi.id)} />
      ))}
    </div>
  );
}

/**
 * The compact activity figures. Sparklines are optional because several of these are point
 * values with no meaningful series behind them.
 */
export function StatTile({
  label,
  value,
  spark,
  hint,
  href,
  trend,
}: {
  label: string;
  value: string;
  spark?: number[];
  hint?: string;
  href?: string;
  trend?: Kpi['trend'];
}) {
  const inner = (
    <>
      <div className="ui-kpi-label" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div className="ui-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div>
          <div className="ui-stat-value">{value}</div>
          {trend && (
            <div className="ui-kpi-foot" style={{ marginTop: 2 }}>
              <Delta trend={trend} showBasis={false} />
            </div>
          )}
        </div>
        {spark && <Sparkline values={spark.slice(-14)} width={72} height={26} />}
      </div>
      {hint && <div className="ui-faint">{hint}</div>}
    </>
  );

  const className = 'ui-kpi ui-stat';
  return href ? (
    <a className={className} href={href} style={{ gap: 5 }}>
      {inner}
    </a>
  ) : (
    <article className={className} style={{ gap: 5 }}>
      {inner}
    </article>
  );
}
