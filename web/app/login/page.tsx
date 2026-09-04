import { redirect } from 'next/navigation';

import { allowedDomains } from '@core/auth/login';

import { currentUser } from '../app/lib/auth';
import { BrandMark, Icon } from '../app/ui/Icons';

import { safeDestination } from './destination';
import { LoginForm } from './LoginForm';

import '../app/app.css';

export const metadata = { title: 'Sign in · Zero Manual Coding' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const POINTS: { icon: string; title: string; body: string }[] = [
  {
    icon: 'award',
    title: 'The Zero Manual Coding board',
    body: 'Write up a delivery once, with the effort it saved, and the whole organisation can read it — and still find it a quarter from now. No key needed.',
  },
  {
    icon: 'terminal',
    title: 'Commands and rules worth stealing',
    body: 'The prompts and rules your colleagues already wrote, with their names on them, ready to copy into your own repository. No key needed.',
  },
  {
    icon: 'gauge',
    title: 'What your agents actually cost',
    body: 'Every Cloud Agent you have run, what it spent, how much of it was cache, and whether anything shipped. This is the part that needs your key.',
  },
];

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requested = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = safeDestination(requested, '');

  if (await currentUser()) redirect(next || '/app');

  const domains = allowedDomains();

  return (
    <div className="ui-root">
      <div className="ui-auth">
        <section className="ui-auth-pitch">
          <a className="ui-row" href="/">
            <span className="ui-brand-mark">
              <BrandMark />
            </span>
            <span className="ui-brand-name">Zero Manual Coding</span>
          </a>

          <h1>Your work email is enough.</h1>
          <p className="ui-auth-lede">
            There is no separate password here. The board, the shared commands and rules and
            the resources open on your email alone. Add a Cursor API key and the measured half
            unlocks too — Cursor is asked whose key it is, so the account you see is the
            account it belongs to.
          </p>

          <div className="ui-auth-points">
            {POINTS.map((point) => (
              <div className="ui-auth-point" key={point.title}>
                <span>
                  <Icon name={point.icon} size={14} />
                </span>
                <span>
                  <b>{point.title}</b>
                  <br />
                  {point.body}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="ui-auth-card">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 660, letterSpacing: '-0.02em' }}>Sign in</h2>
            <p className="ui-hint" style={{ marginTop: 4 }}>
              {domains.length > 0
                ? `Open to ${domains.map((domain) => `@${domain}`).join(', ')} accounts. The API key is optional.`
                : 'Any work email. The API key is optional.'}
            </p>
          </div>

          <LoginForm next={next || undefined} />
        </section>
      </div>
    </div>
  );
}
