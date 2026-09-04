import { toPullNumber, toRepoSlug } from '../src/enrich/github';
import { ChainedSource, FileSource } from '../src/enrich/sources';
import { EnrichmentSource, PullRequestRecord, TicketRecord } from '../src/enrich/types';

describe('toRepoSlug', () => {
  it.each([
    ['https://github.com/viacomcbs/bsd-order-management-console', 'viacomcbs/bsd-order-management-console'],
    ['github.com/viacomcbs/bsd-order-management-console', 'viacomcbs/bsd-order-management-console'],
    ['https://www.github.com/owner/name', 'owner/name'],
    ['https://github.com/owner/name.git', 'owner/name'],
    ['https://github.com/owner/name/tree/main', 'owner/name'],
  ])('reads %s as %s', (url, expected) => {
    expect(toRepoSlug(url)).toBe(expected);
  });

  it('returns undefined for a non-GitHub or missing url', () => {
    expect(toRepoSlug('https://gitlab.com/owner/name')).toBeUndefined();
    expect(toRepoSlug(null)).toBeUndefined();
    expect(toRepoSlug(undefined)).toBeUndefined();
  });
});

describe('toPullNumber', () => {
  it('reads the number from a pull request url', () => {
    expect(toPullNumber('https://github.com/owner/name/pull/1226')).toBe(1226);
  });

  it('returns undefined when there is no pull request', () => {
    expect(toPullNumber('https://github.com/owner/name')).toBeUndefined();
    expect(toPullNumber(null)).toBeUndefined();
  });
});

describe('FileSource', () => {
  const source = new FileSource({
    pullRequests: [{ repo: 'owner/name', number: 7, title: 'fix: thing' }],
    tickets: [{ key: 'BSD-1', issueType: 'Bug' }],
  });

  it('returns a stored pull request', async () => {
    expect((await source.getPullRequest('owner/name', 7))?.title).toBe('fix: thing');
  });

  it('returns undefined for one it does not hold', async () => {
    expect(await source.getPullRequest('owner/name', 8)).toBeUndefined();
  });

  it('looks tickets up without regard to case', async () => {
    expect((await source.getTicket('bsd-1'))?.issueType).toBe('Bug');
  });

  it('tolerates an empty export', async () => {
    const empty = new FileSource({});
    expect(await empty.getPullRequest('owner/name', 1)).toBeUndefined();
    expect(await empty.getTicket('BSD-1')).toBeUndefined();
  });
});

describe('ChainedSource', () => {
  const primary: EnrichmentSource = {
    name: 'primary',
    getPullRequest: async (repo, number) =>
      number === 1 ? ({ repo, number, title: 'from primary' } as PullRequestRecord) : undefined,
    getTicket: async () => undefined,
  };
  const fallback: EnrichmentSource = {
    name: 'fallback',
    getPullRequest: async (repo, number) =>
      ({ repo, number, title: 'from fallback' }) as PullRequestRecord,
    getTicket: async (key) => ({ key, issueType: 'Story' }) as TicketRecord,
  };
  const chained = new ChainedSource([primary, fallback]);

  it('prefers the first source that answers', async () => {
    expect((await chained.getPullRequest('owner/name', 1))?.title).toBe('from primary');
  });

  it('falls through when the first has nothing', async () => {
    expect((await chained.getPullRequest('owner/name', 2))?.title).toBe('from fallback');
    expect((await chained.getTicket('BSD-1'))?.issueType).toBe('Story');
  });

  it('names itself after the chain, which ends up in the logs', () => {
    expect(chained.name).toBe('primary then fallback');
  });
});
