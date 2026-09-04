/**
 * Shapes the workspace components render.
 *
 * Forked from the concept UI's types and cut down: what is left is what real queries can
 * actually fill. Anything the Cursor, GitHub and Jira APIs cannot answer was removed rather
 * than left in place to be filled with a plausible number later.
 */

export type Priority = 'critical' | 'high' | 'medium' | 'optimization';

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'blue' | 'violet';

/** How a figure was arrived at. Self-reported savings must never look measured. */
export type Confidence = 'measured' | 'high' | 'medium' | 'low';

export interface Trend {
  /** Signed fraction, so 0.09 renders as +9%. */
  change: number;
  /** What the change is measured against, e.g. "vs previous 30 days". */
  basis: string;
  /** Whether a rise is good news. Spend going up is not. */
  riseIsGood?: boolean;
}

export interface Kpi {
  id: string;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  trend?: Trend;
  icon?: string;
  href?: string;
  /** Secondary figure under a divider, e.g. what the subscription absorbed. */
  extra?: { label: string; value: string };
  score?: number;
}

export interface SeriesPoint {
  label: string;
  values: Record<string, number>;
}

export interface Series {
  key: string;
  label: string;
  color: string;
  format?: 'count' | 'money' | 'tokens' | 'score';
  dashed?: boolean;
}

export interface TrendBoard {
  points: SeriesPoint[];
  tabs: { id: string; label: string; series: Series[] }[];
}

export interface ScoreComponent {
  label: string;
  value: number;
  hint: string;
}

export interface ScoreBreakdown {
  score: number;
  label: string;
  components: ScoreComponent[];
  trend?: Trend;
}

export interface Evidence {
  label: string;
  value: string;
}
