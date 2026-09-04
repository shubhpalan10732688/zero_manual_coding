import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './app.css';

export const metadata: Metadata = {
  title: 'Zero Manual Coding',
  description:
    'What your AI coding work costs, what it shipped, and what the rest of the organisation has learned.',
};

/**
 * The workspace, isolated from everything shipped before it.
 *
 * The `.ui-root` wrapper is what app.css keys its tokens off, and it is also how this tree
 * opts out of the older layout's topbar and fixed content width. The shell itself is
 * rendered per page rather than here, because a layout cannot read searchParams and the
 * period selector has to reflect ?period=.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className="ui-root">{children}</div>;
}
