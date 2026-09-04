import type { ReactNode } from 'react';

import { confidenceLabel, confidenceNote, priorityLabel, priorityTone, signedPercent } from './format';
import type { Confidence, Priority, Tone, Trend } from './types';
import { Icon } from './Icons';

export function Tag({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`ui-tag ui-tag-${tone}`}>{children}</span>;
}

export function PriorityTag({ priority }: { priority: Priority }) {
  return <Tag tone={priorityTone[priority]}>{priorityLabel[priority]}</Tag>;
}

export function StatusTag({ status }: { status: string }) {
  const tone: Tone =
    status === 'deployed' || status === 'approved' || status === 'active' || status === 'merged'
      ? 'good'
      : status === 'in review' || status === 'review' || status === 'measuring'
        ? 'warn'
        : status === 'open'
          ? 'blue'
          : 'neutral';
  return <Tag tone={tone}>{status}</Tag>;
}

/**
 * Period-over-period change. Direction alone is not enough: a rise in spend is bad news and
 * a rise in time saved is good, so the caller states which way is favourable.
 */
export function Delta({ trend, showBasis = true }: { trend: Trend; showBasis?: boolean }) {
  const rising = trend.change > 0;
  const flat = Math.abs(trend.change) < 0.005;
  const favourable = trend.riseIsGood === false ? !rising : rising;
  const className = flat ? 'ui-delta-flat' : favourable ? 'ui-delta-up' : 'ui-delta-down';

  return (
    <>
      <span className={`ui-delta ${className}`}>
        {!flat && <Icon name={rising ? 'arrowUp' : 'arrowDown'} size={11} />}
        {signedPercent(trend.change)}
      </span>
      {showBasis && <span className="ui-faint">{trend.basis}</span>}
    </>
  );
}

/**
 * Labels an estimate with how it was derived. Required by the brief: inferred figures must
 * not sit beside measured ones without saying so.
 */
export function ConfidenceTag({ level }: { level: Confidence }) {
  const tone: Tone =
    level === 'measured' ? 'good' : level === 'high' ? 'blue' : level === 'medium' ? 'warn' : 'bad';
  return (
    <span className={`ui-tag ui-tag-${tone}`} title={confidenceNote[level]}>
      {confidenceLabel[level]}
    </span>
  );
}

export function ConfidenceNote({ level, basis }: { level: Confidence; basis?: string }) {
  return (
    <div className="ui-confidence">
      <span className="ui-confidence-mark">{confidenceLabel[level]}</span>
      <span>{basis ?? confidenceNote[level]}</span>
    </div>
  );
}
