import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Zero Manual Coding',
  description:
    'What people here have achieved by directing an AI agent instead of typing every line themselves.',
};

/**
 * The document shell, and nothing else.
 *
 * There is no navigation here on purpose. The public landing page brings its own header, and
 * every page under /app renders inside a Shell that knows who is signed in and what they are
 * allowed to see — a second nav above that would either duplicate it or contradict it.
 *
 * Styles come from web/app/app/app.css, imported by the pages that need it, so nothing global
 * is loaded for a request that only wants /api/health.
 */

// Every page is per-viewer and reads live data; nothing here may be statically cached.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
