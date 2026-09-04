'use client';

import { usePathname, useSearchParams } from 'next/navigation';

import { periods } from './nav';

/**
 * 7D / 30D / 90D / all selector. Renders links that preserve the rest of the query string,
 * so changing the period keeps whatever filter or tab the reader already chose.
 */
export function PeriodSelector({ active }: { active: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefFor = (period: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', period);
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className="ui-period" role="group" aria-label="Reporting period">
      {periods.map((period) => (
        <a
          key={period.id}
          href={hrefFor(period.id)}
          aria-current={period.id === active ? 'true' : undefined}
        >
          {period.label}
        </a>
      ))}
    </div>
  );
}
