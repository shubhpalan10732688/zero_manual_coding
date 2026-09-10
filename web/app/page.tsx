import { currentUser } from './app/lib/auth';
import {
  boardFacets,
  boardLeaderboard,
  boardTotals,
  publicBoardFeed,
  type BoardPost,
  type BoardTotals,
  type LeaderboardRow,
} from './app/lib/board';
import { BrandMark, Icon } from './app/ui/Icons';
import { count, days as formatDays, initials, percent, plural, when } from './app/ui/format';

import { HERO, HONESTY_NOTE, PRINCIPLES, STEPS, WALL, WHAT_IT_IS } from './landing/content';
import { AuthLink, SignInGate } from './landing/SignIn';
import { WallCard } from './landing/WallCard';

import './app/app.css';

/**
 * The public landing page.
 *
 * The one page here that anybody can read without signing in, which makes it the only place
 * the practice can be shown to somebody who has not adopted it yet. Shown, not explained:
 * the wall comes first and the essay comes after it, because six colleagues describing what
 * they got done is more persuasive than any number of paragraphs about why they should have.
 * Somebody who is already convinced never has to scroll past it.
 *
 * Everything below the hero is read live from the board, so the page cannot claim more than
 * the organisation has actually written down — including, on day one, nothing at all.
 *
 * Note that this exposes internal write-ups (authors, ticket keys, repositories) to anyone
 * who can reach the deployment. That is the point of a wall, but it is only safe behind the
 * same network boundary as the rest of the app, which is where this is deployed.
 */

export const metadata = {
  title: 'Zero Manual Coding',
  description:
    'What people here have achieved by directing an AI agent instead of typing every line themselves.',
};

const WALL_SIZE = 9;

interface BoardSnapshot {
  posts: BoardPost[];
  totals: BoardTotals;
  leaders: LeaderboardRow[];
  tags: string[];
  unavailable: boolean;
}

const EMPTY_TOTALS: BoardTotals = {
  posts: 0,
  contributors: 0,
  posts30d: 0,
  daysSaved: 0,
  postsWithDays: 0,
  avgEffortSavedPct: 0,
  postsWithEffort: 0,
  ticketsReferenced: 0,
};

/**
 * The front door has to open even when the warehouse does not. A database that is down
 * should cost this page its wall, not its explanation of what the practice is.
 */
async function boardSnapshot(): Promise<BoardSnapshot> {
  try {
    const [posts, totals, leaders, facets] = await Promise.all([
      publicBoardFeed(WALL_SIZE),
      boardTotals(),
      boardLeaderboard(8),
      boardFacets(),
    ]);
    return { posts, totals, leaders, tags: facets.tags, unavailable: false };
  } catch {
    return { posts: [], totals: EMPTY_TOTALS, leaders: [], tags: [], unavailable: true };
  }
}

/**
 * The most-liked achievement leads the wall. Falling back to the newest keeps the layout
 * stable on a board where nothing has been liked yet, which is every board for its first
 * week.
 */
function order(posts: BoardPost[]): { featured?: BoardPost; rest: BoardPost[] } {
  if (posts.length === 0) return { rest: [] };
  const featured = posts.reduce((best, post) => (post.likes > best.likes ? post : best), posts[0]!);
  return { featured, rest: posts.filter((post) => post.id !== featured.id) };
}

export default async function LandingPage() {
  const [viewer, board] = await Promise.all([
    currentUser().catch(() => null),
    boardSnapshot(),
  ]);

  const signedIn = Boolean(viewer);
  const { featured, rest } = order(board.posts);

  // The gate sits inside .ui-root rather than around it: the dialog it renders inherits the
  // design tokens down the DOM tree, and the browser's top layer does not change that.
  return (
    <div className="ui-root ui-lp">
      <SignInGate signedIn={signedIn}>
        <a className="ui-skip-link" href="#main-content">Skip to content</a>
        <header className="ui-lp-nav">
          <a className="ui-lp-brand" href="/">
            <span className="ui-brand-mark">
              <BrandMark />
            </span>
            <span className="ui-brand-wordmark">Zero Manual<span>Coding</span></span>
          </a>

          <nav className="ui-lp-links">
            <a href="#wall">Achievements</a>
            <a href="#contributors">Contributors</a>
            <a href="#practice">The practice</a>
            <a href="#take-part">Take part</a>
          </nav>

          <div className="ui-row ui-row-tight">
            <AuthLink className="ui-btn ui-btn-ghost ui-btn-sm" href="/app/board">
              {signedIn ? 'Open the dashboard' : 'Sign in'}
            </AuthLink>
            <AuthLink className="ui-btn ui-btn-primary ui-btn-sm ui-lp-nav-cta" href="/app/board/new">
              <Icon name="plus" size={13} />
              Add achievement
            </AuthLink>
          </div>
        </header>

        <main className="ui-lp-main" id="main-content" tabIndex={-1}>
          <section className="ui-lp-hero">
            <div className="ui-lp-hero-copy">
            <span className="ui-lp-eyebrow">{HERO.eyebrow}</span>
            <h1>{HERO.title}</h1>
            <p className="ui-lp-lede">{HERO.lede}</p>

            <div className="ui-lp-cta">
              <a className="ui-btn ui-btn-primary" href="#wall">
                Explore the achievements
                <Icon name="arrowRight" size={16} />
              </a>
              <a className="ui-btn ui-btn-ghost" href="#practice">
                About the practice
              </a>
            </div>

            <p className="ui-lp-note">
              <Icon name="check" size={14} /> Written by people. Savings reported by their authors.
            </p>
            </div>

            <aside className="ui-spotlight" aria-label="Community spotlight">
              <div className="ui-spotlight-label">
                <span className="ui-section-label">From the community</span>
                <Icon name="award" size={22} />
              </div>
              {featured ? (
                <>
                  <span className="ui-spotlight-kicker">An achievement worth a closer look</span>
                  <h2>{featured.title}</h2>
                  <div className="ui-spotlight-author">
                    <span className="ui-avatar-sm">{initials(featured.authorName, '?')}</span>
                    <span><strong>{featured.authorName}</strong><small>{featured.teamName ?? 'Community contributor'}</small></span>
                  </div>
                  <div className="ui-spotlight-bottom">
                    {featured.timeSavedDays !== null ? (
                      <div><b>~{formatDays(featured.timeSavedDays)}<span> days</span></b><small>saved · self-reported</small></div>
                    ) : <p>A practical approach, shared first-hand.</p>}
                    <AuthLink className="ui-spotlight-link" href={`/app/board/${featured.id}`}>
                      Read the story <Icon name="arrowRight" size={16} />
                    </AuthLink>
                  </div>
                </>
              ) : (
                <>
                  <span className="ui-spotlight-kicker">A small improvement can go a long way</span>
                  <h2>Your next achievement could inspire someone else.</h2>
                  <p>Share the problem, the approach, and what you learned along the way.</p>
                  <AuthLink className="ui-spotlight-link" href="/app/board/new">Share your story <Icon name="arrowRight" size={16} /></AuthLink>
                </>
              )}
            </aside>
          </section>

          {!board.unavailable && board.totals.posts > 0 && (
            <section className="ui-lp-counters" aria-label="What the wall adds up to">
              <Counter
                value={count(board.totals.posts)}
                label={plural(board.totals.posts, 'achievement')}
                sub={`${board.totals.posts30d} in the last 30 days`}
              />
              <Counter
                value={count(board.totals.contributors)}
                label="contributors"
                sub="people who have shared one"
              />
              <Counter
                value={formatDays(board.totals.daysSaved)}
                label="days saved"
                sub={`self-reported across ${board.totals.postsWithDays} ${plural(
                  board.totals.postsWithDays,
                  'achievement',
                )}`}
                tone="good"
              />
              <Counter
                value={
                  board.totals.postsWithEffort > 0
                    ? percent(board.totals.avgEffortSavedPct / 100)
                    : '—'
                }
                label="typical effort saved"
                sub={`mean of ${board.totals.postsWithEffort} ${plural(
                  board.totals.postsWithEffort,
                  'estimate',
                )}`}
                tone="good"
              />
            </section>
          )}

          <section className="ui-lp-section" id="wall">
            <div className="ui-lp-section-head">
              <span className="ui-section-label">01 / The achievement wall</span>
              <h2>{WALL.title}</h2>
              <p className="ui-lp-section-lede">{WALL.lede}</p>
            </div>

            {board.tags.length > 0 && (
              <div className="ui-lp-tags">
                {board.tags.slice(0, 12).map((tag) => (
                  <AuthLink
                    className="ui-chip"
                    key={tag}
                    href={`/app/board?tag=${encodeURIComponent(tag)}`}
                  >
                    {tag}
                  </AuthLink>
                ))}
              </div>
            )}

            {featured ? (
              <>
                <div className="ui-wall">
                  <WallCard post={featured} featured />
                  {rest.map((post) => (
                    <WallCard post={post} key={post.id} />
                  ))}
                </div>

                <div className="ui-lp-wall-more">
                  <AuthLink className="ui-btn ui-btn-ghost" href="/app/board">
                    See all {count(board.totals.posts)} achievements
                    <Icon name="arrowRight" size={13} />
                  </AuthLink>
                  <AuthLink className="ui-btn ui-btn-primary" href="/app/board/new">
                    <Icon name="plus" size={14} />
                    Add yours
                  </AuthLink>
                </div>

                <p className="ui-lp-honesty">
                  <Icon name="info" size={12} /> {HONESTY_NOTE}
                </p>
              </>
            ) : (
              <div className="ui-lp-empty">
                <Icon name="award" size={22} />
                <h3>
                  {board.unavailable
                    ? 'The wall is not reachable right now'
                    : 'Nothing on the wall yet'}
                </h3>
                <p>
                  {board.unavailable
                    ? 'The achievements could not be loaded. Everything below still describes the practice; try again shortly.'
                    : 'Nobody has shared an achievement yet. The first one is the hardest, and it sets the shape everybody else copies — so it may as well be yours.'}
                </p>
                {!board.unavailable && (
                  <AuthLink className="ui-btn ui-btn-primary" href="/app/board/new">
                    <Icon name="plus" size={14} />
                    Share the first one
                  </AuthLink>
                )}
              </div>
            )}
          </section>

          {board.leaders.length > 0 && (
            <section className="ui-lp-section" id="contributors">
              <div className="ui-lp-section-head">
                <span className="ui-section-label">02 / The people behind the progress</span>
                <h2>Better together.</h2>
                <p className="ui-lp-section-lede">
                  Ranked by self-reported days saved, which measures what people shared as much
                  as what they achieved. It is a thank-you list, not a performance rating.
                </p>
              </div>

              <ol className="ui-lp-leaders">
                {board.leaders.map((leader, index) => (
                  <li
                    className={index < 3 ? 'ui-lp-leader ui-lp-leader-top' : 'ui-lp-leader'}
                    key={leader.email}
                  >
                    <span className="ui-lp-rank">{index + 1}</span>
                    <span className="ui-avatar-sm">{initials(leader.name, '?')}</span>
                    <span className="ui-lp-leader-who">
                      <span className="ui-row-title">{leader.name}</span>
                      <span className="ui-row-sub">
                        {leader.teamName ?? 'no team'} · last shared {when(leader.latestPost)}
                      </span>
                    </span>
                    <span className="ui-metric ui-metric-good">
                      <b>{formatDays(leader.daysSaved)}d</b>
                      <span>saved</span>
                    </span>
                    <span className="ui-metric">
                      <b>{leader.posts}</b>
                      <span>{plural(leader.posts, 'achievement')}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="ui-lp-section" id="practice">
            <div className="ui-lp-section-head">
              <span className="ui-section-label">03 / The practice</span>
              <h2>{WHAT_IT_IS.title}</h2>
            </div>

            <div className="ui-lp-prose">
              {WHAT_IT_IS.body.map((paragraph) => (
                <p key={paragraph.slice(0, 32)}>{paragraph}</p>
              ))}
            </div>

            <div className="ui-lp-principles">
              {PRINCIPLES.map((principle) => (
                <article className="ui-lp-principle" key={principle.title}>
                  <span className="ui-kpi-icon">
                    <Icon name={principle.icon} size={15} />
                  </span>
                  <h3>{principle.title}</h3>
                  <p>{principle.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="ui-lp-section" id="take-part">
            <div className="ui-lp-section-head">
              <span className="ui-section-label">04 / Your contribution</span>
              <h2>A few minutes. A useful story.</h2>
            </div>

            <ol className="ui-lp-steps">
              {STEPS.map((step, index) => (
                <li className="ui-lp-step" key={step.title}>
                  <span className="ui-lp-step-n">0{index + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>

            <div className="ui-lp-final">
              <div>
                <span className="ui-section-label">Make your experience someone else’s starting point</span>
                <h3>What did you do differently?</h3>
                <p>
                  Sign in with your work email to share an achievement, explain how you did
                  it, and add your own estimate of the effort and time saved.
                </p>
              </div>
              <AuthLink className="ui-btn ui-btn-primary" href="/app/board/new">
                <Icon name="award" size={14} />
                Share an achievement
              </AuthLink>
            </div>
          </section>
        </main>

        <footer className="ui-lp-foot">
          <span><strong>Zero Manual Coding</strong> · An internal engineering practice</span>
          <span className="ui-row ui-row-tight">
            <a href="/login">Sign in</a>
          </span>
        </footer>
      </SignInGate>
    </div>
  );
}

function Counter({
  value,
  label,
  sub,
  tone,
}: {
  value: string;
  label: string;
  sub: string;
  tone?: 'good';
}) {
  return (
    <div className="ui-lp-counter">
      <b className={tone === 'good' ? 'ui-lp-counter-good' : undefined}>{value}</b>
      <span className="ui-lp-counter-label">{label}</span>
      <span className="ui-lp-counter-sub">{sub}</span>
    </div>
  );
}
