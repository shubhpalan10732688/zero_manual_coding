import { Icon } from './Icons';

/**
 * Filters as links, and search as a plain GET form.
 *
 * Everything a reader picks ends up in the URL, so a filtered board or a category of commands
 * can be linked to and land on the same view. It also keeps these pages server-rendered:
 * there is no client state to hold, so no hydration to pay for.
 */

export interface FilterOption {
  id: string;
  label: string;
  count?: number;
}

export function FilterChips({
  options,
  active,
  hrefFor,
  allLabel = 'All',
  allHref,
}: {
  options: FilterOption[];
  active?: string;
  hrefFor: (id: string) => string;
  allLabel?: string;
  allHref: string;
}) {
  if (options.length === 0) return null;

  return (
    <div className="ui-filters">
      <a className="ui-chip" href={allHref} aria-current={active ? undefined : 'true'}>
        {allLabel}
      </a>
      {options.map((option) => (
        <a
          className="ui-chip"
          href={hrefFor(option.id)}
          key={option.id}
          aria-current={active === option.id ? 'true' : undefined}
        >
          {option.label}
          {option.count !== undefined && <span className="ui-faint"> {option.count}</span>}
        </a>
      ))}
    </div>
  );
}

/**
 * Search that submits as a GET. Hidden inputs carry the filters already applied, so typing a
 * query does not silently discard the category somebody chose a moment ago.
 */
export function SearchBox({
  action,
  placeholder,
  value,
  keep = {},
}: {
  action: string;
  placeholder: string;
  value?: string;
  keep?: Record<string, string | undefined>;
}) {
  return (
    <form className="ui-search" action={action} method="get">
      <Icon name="search" size={14} />
      <input type="search" name="q" aria-label="Search" defaultValue={value ?? ''} placeholder={placeholder} />
      {Object.entries(keep)
        .filter(([, entry]) => entry)
        .map(([name, entry]) => (
          <input type="hidden" name={name} value={entry} key={name} />
        ))}
      <button type="submit" className="ui-btn ui-btn-ghost ui-btn-sm">
        Search
      </button>
    </form>
  );
}
