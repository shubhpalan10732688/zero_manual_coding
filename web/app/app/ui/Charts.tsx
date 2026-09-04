/**
 * Charts for v2, rendered as SVG on the server.
 *
 * No chart library: the existing app already draws its charts this way, and adding a
 * dependency would mean touching web/package.json. Hover readouts are pure CSS
 * (.ui-hoverzone:hover + .ui-tip), so these stay server components with no hydration cost.
 */

import { compact, money, score as formatScore, scoreLabel, scoreTone } from './format';
import type { Series, SeriesPoint, ScoreBreakdown, TrendBoard } from './types';

function formatBy(kind: Series['format'], value: number): string {
  switch (kind) {
    case 'money':
      return money(value);
    case 'tokens':
      return compact(value);
    case 'score':
      return formatScore(value);
    default:
      return compact(value);
  }
}

function shortLabel(label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(label)) return label;
  const date = new Date(`${label.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const W = 720;
const H = 200;
const PAD_L = 44;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 26;

/**
 * Multi-series line chart with a value axis, weekday-aware labels and a per-point readout.
 * Tabs are links so switching metric stays a server render and remains linkable.
 */
export function TrendChart({
  board,
  activeTab,
  height = H,
}: {
  board: TrendBoard;
  activeTab: string;
  height?: number;
}) {
  const tab = board.tabs.find((entry) => entry.id === activeTab) ?? board.tabs[0]!;
  const points = board.points;
  const series = tab.series;

  const values = points.flatMap((point) => series.map((entry) => point.values[entry.key] ?? 0));
  const max = Math.max(...values, 1);
  const min = 0;
  const span = max - min || 1;
  const steps = Math.max(points.length - 1, 1);

  const x = (index: number) => PAD_L + (index / steps) * (W - PAD_L - PAD_R);
  const y = (value: number) => height - PAD_B - ((value - min) / span) * (height - PAD_T - PAD_B);

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label={tab.label}>
        <defs>
          <linearGradient id={`ui-fill-${tab.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={series[0]!.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={series[0]!.color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridLines.map((fraction) => {
          const value = min + span * fraction;
          const lineY = y(value);
          return (
            <g key={fraction}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={lineY}
                y2={lineY}
                stroke="var(--ui-border)"
                strokeWidth="1"
                strokeDasharray={fraction === 0 ? undefined : '3 5'}
              />
              <text className="ui-axis" x={PAD_L - 8} y={lineY + 3} textAnchor="end">
                {formatBy(series[0]!.format, value)}
              </text>
            </g>
          );
        })}

        {points.map((point, index) =>
          index % labelEvery === 0 || index === points.length - 1 ? (
            <text
              key={point.label}
              className="ui-axis"
              x={x(index)}
              y={height - 8}
              textAnchor={index === points.length - 1 ? 'end' : 'middle'}
            >
              {shortLabel(point.label)}
            </text>
          ) : null,
        )}

        <path
          d={`${points
            .map(
              (point, index) =>
                `${index === 0 ? 'M' : 'L'}${x(index)},${y(point.values[series[0]!.key] ?? 0)}`,
            )
            .join(' ')} L${x(points.length - 1)},${height - PAD_B} L${PAD_L},${height - PAD_B} Z`}
          fill={`url(#ui-fill-${tab.id})`}
        />

        {series.map((entry) => (
          <polyline
            key={entry.key}
            points={points
              .map((point, index) => `${x(index)},${y(point.values[entry.key] ?? 0)}`)
              .join(' ')}
            fill="none"
            stroke={entry.color}
            strokeWidth={entry.dashed ? 1.5 : 2}
            strokeDasharray={entry.dashed ? '4 4' : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        <circle
          cx={x(points.length - 1)}
          cy={y(points[points.length - 1]!.values[series[0]!.key] ?? 0)}
          r="3.5"
          fill={series[0]!.color}
        />

        {/* Hover pairs last so the readouts paint above the lines. */}
        {points.map((point, index) => {
          const zoneWidth = (W - PAD_L - PAD_R) / steps;
          const boxWidth = 132;
          const boxHeight = 26 + series.length * 13;
          const flip = x(index) > W - boxWidth - 30;
          const boxX = flip ? x(index) - boxWidth - 10 : x(index) + 10;
          return (
            <g key={point.label}>
              <rect
                className="ui-hoverzone"
                x={x(index) - zoneWidth / 2}
                y={PAD_T}
                width={zoneWidth}
                height={height - PAD_T - PAD_B}
              />
              <g className="ui-tip">
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={PAD_T}
                  y2={height - PAD_B}
                  stroke="var(--ui-border-strong)"
                  strokeWidth="1"
                />
                <rect className="ui-tip-box" x={boxX} y={PAD_T + 4} width={boxWidth} height={boxHeight} />
                <text className="ui-tip-title" x={boxX + 10} y={PAD_T + 21}>
                  {shortLabel(point.label)}
                </text>
                {series.map((entry, row) => (
                  <text
                    key={entry.key}
                    className="ui-tip-row"
                    x={boxX + 10}
                    y={PAD_T + 37 + row * 13}
                  >
                    {entry.label}: {formatBy(entry.format, point.values[entry.key] ?? 0)}
                  </text>
                ))}
              </g>
            </g>
          );
        })}
      </svg>

      <div className="ui-legend">
        {series.map((entry) => (
          <span className="ui-legend-key" key={entry.key}>
            <span className="ui-legend-swatch" style={{ background: entry.color }} />
            {entry.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          {shortLabel(points[0]!.label)} to {shortLabel(points[points.length - 1]!.label)}
        </span>
        <span>peak {formatBy(series[0]!.format, max)}</span>
      </div>
    </div>
  );
}

/** Metric tabs for a trend card. Links, so the selection is shareable. */
export function ChartTabs({
  board,
  activeTab,
  hrefFor,
}: {
  board: TrendBoard;
  activeTab: string;
  hrefFor: (tabId: string) => string;
}) {
  return (
    <div className="ui-chart-tabs" role="tablist">
      {board.tabs.map((tab) => (
        <a
          key={tab.id}
          href={hrefFor(tab.id)}
          role="tab"
          aria-current={tab.id === activeTab ? 'true' : undefined}
        >
          {tab.label}
        </a>
      ))}
    </div>
  );
}

export function Sparkline({
  values,
  color = 'var(--ui-blue)',
  width = 108,
  height = 30,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((value, index) => `${index * step},${height - 2 - ((value - min) / span) * (height - 5)}`)
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The score ring used on KPI cards and score summaries. */
export function ScoreDial({
  value,
  size = 96,
  caption,
}: {
  value: number;
  size?: number;
  caption?: string;
}) {
  const stroke = size >= 80 ? 8 : 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(Math.max(value, 0), 100) / 100) * circumference;
  const tone = scoreTone(value);
  const color =
    tone === 'good' ? 'var(--ui-good)' : tone === 'warn' ? 'var(--ui-warn)' : 'var(--ui-bad)';

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(value)} out of 100`}>
        <defs>
          <linearGradient id={`ui-dial-${Math.round(value)}-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor="var(--ui-violet)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ui-surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#ui-dial-${Math.round(value)}-${size})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--ui-text)"
          fontSize={size * 0.3}
          fontWeight="650"
          letterSpacing="-0.03em"
        >
          {Math.round(value)}
        </text>
      </svg>
      {caption !== undefined && (
        <span className="ui-faint" style={{ color }}>
          {caption || scoreLabel(value)}
        </span>
      )}
    </div>
  );
}

export function BarList({
  items,
  tone,
}: {
  items: { label: string; value: number; display: string; color?: string }[];
  tone?: 'gradient' | 'score';
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="ui-bars">
      {items.map((item) => {
        const width = `${Math.max((item.value / max) * 100, 2)}%`;
        const background =
          item.color ??
          (tone === 'score'
            ? scoreTone(item.value) === 'good'
              ? 'var(--ui-good)'
              : scoreTone(item.value) === 'warn'
                ? 'var(--ui-warn)'
                : 'var(--ui-bad)'
            : undefined);
        return (
          <div className="ui-bar-row" key={item.label}>
            <span className="ui-bar-label" title={item.label}>
              {item.label}
            </span>
            <span className="ui-bar-track">
              <span className="ui-bar-fill" style={{ width, background }} />
            </span>
            <span className="ui-bar-value">{item.display}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The effectiveness breakdown. Every component score is shown with its own bar so the
 * headline score is explainable, which the brief requires of any score in the product.
 */
export function ScoreBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <div>
      <div className="ui-bars">
        {breakdown.components.map((component) => (
          <div className="ui-bar-row" key={component.label}>
            <span className="ui-bar-label" title={component.hint}>
              {component.label}
            </span>
            <span className="ui-bar-track">
              <span
                className="ui-bar-fill"
                style={{
                  width: `${component.value}%`,
                  background:
                    component.value >= 85
                      ? 'var(--ui-good)'
                      : component.value >= 75
                        ? 'var(--ui-blue)'
                        : 'var(--ui-warn)',
                }}
              />
            </span>
            <span className="ui-bar-value">{component.value}</span>
          </div>
        ))}
      </div>
      <div className="ui-score-strip">
        <span>{breakdown.label}</span>
        <span>
          <strong>{breakdown.score}</strong> <span className="ui-faint">/ 100</span>
        </span>
      </div>
    </div>
  );
}

/** Proportional segments on one track, for cost or usage composition. */
export function ShareBar({
  segments,
}: {
  segments: { label: string; value: number; color: string; display: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          height: 10,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'var(--ui-surface-3)',
        }}
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            title={`${segment.label}: ${segment.display}`}
            style={{ width: `${(segment.value / total) * 100}%`, background: segment.color }}
          />
        ))}
      </div>
      <div className="ui-legend">
        {segments.map((segment) => (
          <span className="ui-legend-key" key={segment.label}>
            <span
              className="ui-legend-swatch"
              style={{ background: segment.color, height: 8, width: 8, borderRadius: 999 }}
            />
            {segment.label}
            <span style={{ color: 'var(--ui-text-muted)', fontWeight: 600 }}>{segment.display}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
