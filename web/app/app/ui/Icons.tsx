/**
 * Inline icon set. Kept local rather than pulling in an icon package, so the workspace adds
 * no dependency to web/package.json and the existing build stays exactly as it is.
 */

const paths: Record<string, string[]> = {
  grid: ['M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z'],
  chart: ['M3 3v18h18', 'M7 15l4-5 3 3 5-7'],
  terminal: ['M4 4h16v16H4z', 'M8 9l2.5 2.5L8 14', 'M13 15h4'],
  shield: ['M12 3l8 3v6c0 4.5-3.2 7.9-8 9-4.8-1.1-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  target: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M12 8a4 4 0 100 8 4 4 0 000-8z', 'M12 11.5v1'],
  bolt: ['M13 2L5 14h6l-1 8 8-12h-6z'],
  book: ['M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z', 'M9 3v18'],
  sparkle: [
    'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    'M18 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z',
  ],
  cog: [
    'M12 9a3 3 0 100 6 3 3 0 000-6z',
    'M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2 2 2 0 11-4 0 1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15a2 2 0 110-4 1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 4.1a2 2 0 114 0 1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 11a2 2 0 110 4z',
  ],
  users: [
    'M16 20v-1.5a4 4 0 00-4-4H6a4 4 0 00-4 4V20',
    'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
    'M22 20v-1.5a4 4 0 00-3-3.9',
    'M16 4.1a3.5 3.5 0 010 6.8',
  ],
  user: ['M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'],
  coin: [
    'M12 3c4.4 0 8 1.6 8 3.5S16.4 10 12 10 4 8.4 4 6.5 7.6 3 12 3z',
    'M4 6.5v11C4 19.4 7.6 21 12 21s8-1.6 8-3.5v-11',
    'M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5',
  ],
  gauge: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 12l4-3.5'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3.5 2'],
  branch: [
    'M6 3v12',
    'M6 21a3 3 0 100-6 3 3 0 000 6z',
    'M18 9a3 3 0 100-6 3 3 0 000 6z',
    'M18 9c0 4-6 2-6 6',
  ],
  code: ['M9 8l-4 4 4 4', 'M15 8l4 4-4 4'],
  ticket: ['M4 6h16v4a2 2 0 000 4v4H4v-4a2 2 0 000-4z', 'M12 6v12'],
  chat: ['M21 12a8 8 0 01-8 8H8l-5 3 1.4-4.6A8 8 0 1121 12z'],
  bug: [
    'M8 6h8v5a4 4 0 01-8 0z',
    'M12 15v5',
    'M5 10H3',
    'M21 10h-2',
    'M6 17l-2 2',
    'M18 17l2 2',
    'M9 4L8 2',
    'M15 4l1-2',
  ],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  cpu: ['M6 6h12v12H6z', 'M10 10h4v4h-4z', 'M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3'],
  bell: ['M18 15V10a6 6 0 10-12 0v5l-2 3h16z', 'M10 21h4'],
  arrowRight: ['M4 12h15', 'M13 6l6 6-6 6'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  chevronRight: ['M9 5l7 7-7 7'],
  chevronLeft: ['M15 5l-7 7 7 7'],
  check: ['M4 12.5l5 5L20 6.5'],
  alert: ['M12 3l9 17H3z', 'M12 9v5', 'M12 17v.5'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v6', 'M12 7.5v.5'],
  send: ['M21 3L3 10.5l7 3 3 7z', 'M21 3L10 14'],
  external: [
    'M14 4h6v6',
    'M20 4l-9 9',
    'M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  ],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M20 20l-4.2-4.2'],
  filter: ['M3 5h18l-7 8v6l-4-2v-4z'],
  download: ['M12 3v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  plus: ['M12 5v14', 'M5 12h14'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'M12 15a3 3 0 100-6 3 3 0 000 6z'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 018 0v4'],
  key: ['M15 8a4 4 0 10-3.5 4L10 13.5V16H7.5L6 17.5V20H3v-3l7-7A4 4 0 0015 8z'],
  file: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 13h6M9 17h6'],
  repeat: ['M4 9V7a2 2 0 012-2h11', 'M14 2l3 3-3 3', 'M20 15v2a2 2 0 01-2 2H7', 'M10 22l-3-3 3-3'],
  trend: ['M3 17l6-6 4 4 8-8', 'M15 7h6v6'],
  // Added for the workspace: the board, the resource shelf, the news feed, connections.
  award: ['M12 15a6 6 0 100-12 6 6 0 000 12z', 'M9 14.5L7.5 22l4.5-2.6L16.5 22 15 14.5'],
  star: ['M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z'],
  rss: ['M5 19a1 1 0 100-2 1 1 0 000 2z', 'M4 11a9 9 0 019 9', 'M4 5a15 15 0 0115 15'],
  copy: ['M9 9h11v11H9z', 'M15 5H4v11'],
  logout: ['M15 12H4', 'M8 8l-4 4 4 4', 'M12 4h6a2 2 0 012 2v12a2 2 0 01-2 2h-6'],
  plug: ['M9 3v6', 'M15 3v6', 'M6 9h12v3a6 6 0 01-12 0z', 'M12 18v3'],
  link: [
    'M10 13a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7L11.5 6',
    'M14 11a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7L12.5 18',
  ],
  github: [
    'M9 19c-4 1.3-4-2.2-6-2.7m12 5.4v-3.9a3.4 3.4 0 00-.9-2.6c3-.3 6.1-1.5 6.1-6.7A5.2 5.2 0 0018.8 5a4.8 4.8 0 00-.1-3.6s-1.4-.4-4.5 1.7a12.3 12.3 0 00-6.4 0C4.7 1 3.3 1.4 3.3 1.4A4.8 4.8 0 003.2 5 5.2 5.2 0 001.8 8.7c0 5.1 3.1 6.3 6.1 6.7a3.4 3.4 0 00-.9 2.6V22',
  ],
  message: ['M4 5h16v11H8l-4 4z'],
  heart: ['M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0112 8.2a4.1 4.1 0 017.5 2.4c0 4.8-7.5 9.4-7.5 9.4z'],
};

export type IconName = keyof typeof paths;

/**
 * `filled` exists for the one icon whose two states have to be distinguishable at a glance
 * across a whole wall of cards: an outlined heart and a solid one read as off and on, where
 * a colour change alone does not survive being scrolled past.
 */
export function Icon({
  name,
  size = 16,
  className,
  filled = false,
}: {
  name: IconName | string;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  const shape = paths[name] ?? paths.grid!;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {shape.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** The product mark, used in the sidebar and on the sign-in page. */
export function BrandMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l8.5 15h-17z"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinejoin="round"
        fill="rgba(255,255,255,0.16)"
      />
      <circle cx="12" cy="13.5" r="2.1" fill="#fff" />
    </svg>
  );
}
