import { CursorApiError, CursorClient, CursorNetworkError } from '../src/client/cursorClient';
import { DateWindow } from '../src/client/dates';

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown> | undefined;
}

function stubFetch(responses: Array<{ status?: number; body: unknown; headers?: Record<string, string> }>) {
  const calls: Call[] = [];
  let index = 0;

  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const raw = init.body;
    calls.push({
      url: String(url),
      init,
      body: typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : undefined,
    });
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return new Response(typeof next.body === 'string' ? next.body : JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: next.headers,
    });
  }) as unknown as typeof fetch;

  return { impl, calls };
}

const window: DateWindow = {
  start: new Date('2026-08-01T00:00:00.000Z'),
  end: new Date('2026-08-01T23:59:59.999Z'),
};

function client(fetchImpl: typeof fetch, overrides = {}) {
  return new CursorClient({
    apiKey: 'crsr_test',
    baseUrl: 'https://api.example.test',
    fetchImpl,
    sleep: async () => undefined,
    ...overrides,
  });
}

describe('authentication', () => {
  it('sends the key as the Basic auth username with an empty password', async () => {
    const { impl, calls } = stubFetch([{ body: { teamMembers: [] } }]);
    await client(impl).getMembers();

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('crsr_test:').toString('base64')}`);
  });
});

describe('daily usage', () => {
  it('always sends page and pageSize so inactive members are included', async () => {
    const { impl, calls } = stubFetch([
      { body: { data: [], pagination: { page: 1, pageSize: 1000, totalPages: 1, hasNextPage: false } } },
    ]);

    await client(impl).getDailyUsagePage(window, 1, 1000);

    expect(calls[0]!.body).toMatchObject({
      startDate: window.start.getTime(),
      endDate: window.end.getTime(),
      page: 1,
      pageSize: 1000,
    });
  });

  it('walks every page and stops when the API says there are no more', async () => {
    const { impl, calls } = stubFetch([
      {
        body: {
          data: [{ email: 'a@x.com' }],
          pagination: { page: 1, pageSize: 1, totalPages: 2, hasNextPage: true, totalUsers: 2 },
        },
      },
      {
        body: {
          data: [{ email: 'b@x.com' }],
          pagination: { page: 2, pageSize: 1, totalPages: 2, hasNextPage: false, totalUsers: 2 },
        },
      },
    ]);

    const seen: string[] = [];
    for await (const page of client(impl).iterateDailyUsage(window, 1)) {
      seen.push(...page.items.map((row) => row.email));
    }

    expect(seen).toEqual(['a@x.com', 'b@x.com']);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body).toMatchObject({ page: 2 });
  });
});

describe('usage events', () => {
  it('normalizes the numPages/currentPage envelope into the shared shape', async () => {
    const { impl } = stubFetch([
      {
        body: {
          usageEvents: [{ timestamp: '1' }],
          totalUsageEventsCount: 42,
          pagination: { numPages: 3, currentPage: 1, pageSize: 25, hasNextPage: true },
        },
      },
    ]);

    const page = await client(impl).getUsageEventsPage(window, 1, 25);

    expect(page).toMatchObject({
      page: 1,
      pageSize: 25,
      totalPages: 3,
      hasNextPage: true,
      totalCount: 42,
    });
    expect(page.items).toHaveLength(1);
  });

  it('passes the inclusive end bound through untouched', async () => {
    const { impl, calls } = stubFetch([{ body: { usageEvents: [] } }]);
    await client(impl).getUsageEventsPage(window, 1, 100);

    expect(calls[0]!.body!.endDate).toBe(new Date('2026-08-01T23:59:59.999Z').getTime());
  });

  it('stops iterating when a page comes back empty even if the flag says otherwise', async () => {
    const { impl, calls } = stubFetch([
      {
        body: {
          usageEvents: [],
          pagination: { numPages: 99, currentPage: 1, pageSize: 100, hasNextPage: true },
        },
      },
    ]);

    const pages = [];
    for await (const page of client(impl).iterateUsageEvents(window, 100)) {
      pages.push(page);
    }

    expect(pages).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});

describe('error handling', () => {
  it('retries a 429 and honours Retry-After', async () => {
    const waits: number[] = [];
    const { impl, calls } = stubFetch([
      { status: 429, body: { error: 'Too Many Requests' }, headers: { 'retry-after': '2' } },
      { body: { teamMembers: [{ id: 'user_1', email: 'a@x.com', name: 'A', role: 'member', isRemoved: false }] } },
    ]);

    const members = await client(impl, {
      sleep: async (ms: number) => {
        waits.push(ms);
      },
    }).getMembers();

    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]);
    expect(members).toHaveLength(1);
  });

  it('retries 5xx up to the configured limit and then gives up', async () => {
    const { impl, calls } = stubFetch([{ status: 503, body: 'upstream unavailable' }]);

    await expect(client(impl, { maxRetries: 2 }).getMembers()).rejects.toThrow(CursorApiError);
    expect(calls).toHaveLength(3);
  });

  it('surfaces the cause chain instead of a bare "fetch failed"', async () => {
    let calls = 0;
    const failing = (async () => {
      calls += 1;
      const error = new TypeError('fetch failed');
      (error as Error & { cause?: unknown }).cause = Object.assign(new Error('socket hang up'), {
        code: 'ECONNRESET',
      });
      throw error;
    }) as unknown as typeof fetch;

    const error = await client(failing, { maxRetries: 2 })
      .getMembers()
      .catch((caught: CursorNetworkError) => caught);

    expect(error).toBeInstanceOf(CursorNetworkError);
    expect((error as CursorNetworkError).message).toContain('ECONNRESET: socket hang up');
    expect(calls).toBe(3);
  });

  it('does not retry a certificate failure, and explains how to fix it', async () => {
    let calls = 0;
    const failing = (async () => {
      calls += 1;
      const error = new TypeError('fetch failed');
      (error as Error & { cause?: unknown }).cause = Object.assign(
        new Error('unable to get local issuer certificate'),
        { code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' },
      );
      throw error;
    }) as unknown as typeof fetch;

    const error = await client(failing, { maxRetries: 5 })
      .getMembers()
      .catch((caught: CursorNetworkError) => caught);

    expect(error).toBeInstanceOf(CursorNetworkError);
    expect((error as CursorNetworkError).isTlsTrustFailure).toBe(true);
    expect((error as CursorNetworkError).message).toContain('--use-system-ca');
    // Retrying a trust problem just wastes a minute before failing anyway.
    expect(calls).toBe(1);
  });

  it('does not retry a 403 and flags it as an access problem', async () => {
    const { impl, calls } = stubFetch([{ status: 403, body: 'forbidden' }]);

    const error = await client(impl)
      .getAiCodeCommitsPage('2026-08-01', '2026-08-08', 1, 10)
      .catch((caught: CursorApiError) => caught);

    expect(error).toBeInstanceOf(CursorApiError);
    expect((error as CursorApiError).isAccessDenied).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
