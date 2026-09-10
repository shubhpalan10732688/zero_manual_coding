'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from './Icons';
import type { NavItem } from './nav';

/**
 * Client component purely to mark the active route. The index route is matched exactly,
 * since every other href in the workspace is prefixed by it.
 */
export function SidebarNav({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === root) return pathname === root || pathname === `${root}/`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav style={{ display: 'grid', gap: 2 }} aria-label="Sections">
      {items.map((item) => (
        <div key={item.href} style={{ display: 'contents' }}>
          {item.group && <div className="ui-nav-group">{item.group}</div>}
          <Link
            href={item.href}
            className="ui-navlink"
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <Icon name={item.icon} size={16} />
            {item.label}
            {item.count ? <span className="ui-navlink-count">{item.count}</span> : null}
          </Link>
        </div>
      ))}
    </nav>
  );
}
