import { logger } from '../logger';

import { DateWindow } from './dates';
import { RateLimiter } from './rateLimiter';
import {
  AiCodeCommit,
  AiCodeCommitsResponse,
  CloudAgent,
  CloudAgentListResponse,
  CloudAgentRun,
  CloudAgentRunsResponse,
  CloudAgentUsage,
  DailyUsageResponse,
  DailyUsageRow,
  MembersResponse,
  NormalizedPage,
  TeamMember,
  UsageEvent,
  UsageEventFilters,
  UsageEventsResponse,
} from './types';

/** Cursor's documented per-minute budgets, per team. */
export const RATE_LIMITS = {
  admin: 20,
  usageEvents: 60,
  analytics: 50,
  aiCode: 20,
  // Undocumented for the agent endpoints. Deliberately conservative, since ingestion
  // makes two calls per agent and would otherwise burst.
  agents: 60,
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

export const MAX_DAILY_USAGE_WINDOW_DAYS = 30;

/**
 * Certificate problems are configuration, not weather: retrying cannot fix them.
 * On a machine behind a TLS-inspecting corporate proxy, Node rejects the re-signed
 * certificate because it trusts its own bundled CA list rather than the OS store.
 */
const TLS_TRUST_ERROR_CODES = new Set([
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'CERT_HAS_EXPIRED',
]);

interface ErrorWithCause {
  message?: string;
  code?: string;
  cause?: unknown;
}

function causeChain(error: unknown): string[] {
  const messages: string[] = [];
  let current = error as ErrorWithCause | undefined;
  while (current && messages.length < 5) {
    if (current.message) {
      messages.push(current.code ? `${current.code}: ${current.message}` : current.message);
    }
    current = current.cause as ErrorWithCause | undefined;
  }
  return messages;
}

function isTlsTrustError(error: unknown): boolean {
  let current = error as ErrorWithCause | undefined;
  while (current) {
    if (current.code && TLS_TRUST_ERROR_CODES.has(current.code)) return true;
    current = current.cause as ErrorWithCause | undefined;
  }
  return false;
}

/**
 * Raised when the request never reached Cursor. `fetch failed` on its own says
 * nothing, so the underlying cause chain is preserved in the message.
 */
export class CursorNetworkError extends Error {
  constructor(
    readonly path: string,
    readonly causes: string[],
    readonly isTlsTrustFailure: boolean,
  ) {
    const detail = causes.join(' <- ') || 'no further detail';
    super(
      isTlsTrustFailure
        ? `Could not verify the TLS certificate for ${path} (${detail}). ` +
          'On a network that inspects TLS, run Node with --use-system-ca so it trusts the ' +
          'certificates the OS already trusts, or point NODE_EXTRA_CA_CERTS at your root CA.'
        : `Request to ${path} failed before reaching Cursor: ${detail}`,
    );
    this.name = 'CursorNetworkError';
  }
}

export class CursorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'CursorApiError';
  }

  /** 401/403 usually means the plan or key scope does not cover this endpoint. */
  get isAccessDenied(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export interface ApiKeyIdentity {
  apiKeyName?: string;
  userId?: number;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;
}

export interface CursorClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  bucket?: RateBucket;
  accept?: string;
}

export class CursorClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly requestTimeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiters: Record<RateBucket, RateLimiter>;

  constructor(options: CursorClientOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.cursor.com').replace(/\/$/, '');
    // Basic auth with the key as username and an empty password.
    this.authHeader = `Basic ${Buffer.from(`${options.apiKey}:`).toString('base64')}`;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? 5;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.limiters = {
      admin: new RateLimiter(RATE_LIMITS.admin),
      usageEvents: new RateLimiter(RATE_LIMITS.usageEvents),
      analytics: new RateLimiter(RATE_LIMITS.analytics),
      aiCode: new RateLimiter(RATE_LIMITS.aiCode),
      agents: new RateLimiter(RATE_LIMITS.agents),
    };
  }

  async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    const { method = 'GET', body, query, bucket = 'admin', accept = 'application/json' } = options;
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    let attempt = 0;
    for (;;) {
      await this.limiters[bucket].acquire();

      let response: Response;
      try {
        response = await this.fetchImpl(url.toString(), {
          method,
          headers: {
            Authorization: this.authHeader,
            Accept: accept,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
      } catch (error) {
        const tlsFailure = isTlsTrustError(error);
        if (tlsFailure || attempt >= this.maxRetries) {
          throw new CursorNetworkError(path, causeChain(error), tlsFailure);
        }
        await this.backoff(++attempt, undefined, path, causeChain(error)[0] ?? 'network error');
        continue;
      }

      if (response.ok) {
        return await response.text();
      }

      const text = await response.text().catch(() => '');

      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        await this.backoff(++attempt, retryAfter, path, `HTTP ${response.status}`);
        continue;
      }

      throw new CursorApiError(
        `Cursor API ${method} ${path} failed with ${response.status}`,
        response.status,
        path,
        text.slice(0, 500),
      );
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const text = await this.requestText(path, options);
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  private async backoff(
    attempt: number,
    retryAfterMs: number | undefined,
    path: string,
    reason: string,
  ): Promise<void> {
    const exponential = Math.min(2 ** attempt * 500, 30_000);
    const jitter = Math.floor(Math.random() * 250);
    const waitMs = retryAfterMs ?? exponential + jitter;
    logger.warn('Retrying Cursor API request', { path, attempt, reason, waitMs });
    await this.sleep(waitMs);
  }

  async getMembers(): Promise<TeamMember[]> {
    const response = await this.request<MembersResponse>('/teams/members', { bucket: 'admin' });
    return response.teamMembers ?? [];
  }

  /**
   * Always send page and pageSize. Without them the endpoint returns active users only,
   * which would hide exactly the idle seats we want to report on.
   */
  async getDailyUsagePage(
    window: DateWindow,
    page: number,
    pageSize: number,
  ): Promise<NormalizedPage<DailyUsageRow>> {
    const response = await this.request<DailyUsageResponse>('/teams/daily-usage-data', {
      method: 'POST',
      bucket: 'admin',
      body: {
        startDate: window.start.getTime(),
        endDate: window.end.getTime(),
        page,
        pageSize,
      },
    });

    const pagination = response.pagination;
    return {
      items: response.data ?? [],
      page: pagination?.page ?? page,
      pageSize: pagination?.pageSize ?? pageSize,
      totalPages: pagination?.totalPages ?? 1,
      hasNextPage: pagination?.hasNextPage ?? false,
      totalCount: pagination?.totalUsers ?? pagination?.totalCount,
    };
  }

  async *iterateDailyUsage(
    window: DateWindow,
    pageSize = 1000,
  ): AsyncGenerator<NormalizedPage<DailyUsageRow>> {
    let page = 1;
    for (;;) {
      const result = await this.getDailyUsagePage(window, page, pageSize);
      yield result;
      if (!result.hasNextPage || result.items.length === 0) return;
      page += 1;
      if (page > result.totalPages && result.totalPages > 0) return;
    }
  }

  async getUsageEventsPage(
    window: DateWindow,
    page: number,
    pageSize: number,
    filters: UsageEventFilters = {},
  ): Promise<NormalizedPage<UsageEvent>> {
    const response = await this.request<UsageEventsResponse>('/teams/filtered-usage-events', {
      method: 'POST',
      bucket: 'usageEvents',
      body: {
        // Both bounds are inclusive; window.end is already 23:59:59.999.
        startDate: window.start.getTime(),
        endDate: window.end.getTime(),
        page,
        pageSize,
        ...filters,
      },
    });

    const pagination = response.pagination;
    return {
      items: response.usageEvents ?? [],
      page: pagination?.currentPage ?? page,
      pageSize: pagination?.pageSize ?? pageSize,
      totalPages: pagination?.numPages ?? 1,
      hasNextPage: pagination?.hasNextPage ?? false,
      totalCount: response.totalUsageEventsCount,
    };
  }

  async *iterateUsageEvents(
    window: DateWindow,
    pageSize = 1000,
    filters: UsageEventFilters = {},
  ): AsyncGenerator<NormalizedPage<UsageEvent>> {
    let page = 1;
    for (;;) {
      const result = await this.getUsageEventsPage(window, page, pageSize, filters);
      yield result;
      if (!result.hasNextPage || result.items.length === 0) return;
      page += 1;
      if (page > result.totalPages && result.totalPages > 0) return;
    }
  }

  /** Enterprise, alpha. Used by preflight and milestone 2. */
  async getAiCodeCommitsPage(
    startDate: string,
    endDate: string,
    page: number,
    pageSize: number,
  ): Promise<NormalizedPage<AiCodeCommit>> {
    const response = await this.request<AiCodeCommitsResponse>('/analytics/ai-code/commits', {
      bucket: 'aiCode',
      query: { startDate, endDate, page, pageSize },
    });

    const totalPages = Math.max(1, Math.ceil((response.totalCount ?? 0) / pageSize));
    return {
      items: response.items ?? [],
      page: response.page ?? page,
      pageSize: response.pageSize ?? pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      totalCount: response.totalCount,
    };
  }

  /** Streams the whole range as CSV; the server pages internally. */
  async getAiCodeCommitsCsv(startDate: string, endDate: string): Promise<string> {
    return this.requestText('/analytics/ai-code/commits.csv', {
      bucket: 'aiCode',
      accept: 'text/csv',
      query: { startDate, endDate },
    });
  }

  /**
   * Identifies the key itself. A user-scoped key answers here but is rejected by every
   * /teams endpoint, which is otherwise indistinguishable from a revoked key.
   */
  async getApiKeyIdentity(): Promise<ApiKeyIdentity> {
    return this.request<ApiKeyIdentity>('/v1/me', { bucket: 'admin' });
  }

  /**
   * Cloud Agents, the one substantial dataset a personal key can read. Paginates with an
   * opaque cursor that is omitted rather than nulled when the list is exhausted.
   */
  async listAgents(limit = 100): Promise<CloudAgent[]> {
    const agents: CloudAgent[] = [];
    let cursor: string | undefined;

    do {
      const page = await this.request<CloudAgentListResponse>('/v1/agents', {
        bucket: 'agents',
        query: { limit, cursor },
      });
      agents.push(...(page.items ?? []));
      cursor = page.nextCursor;
      // Guard against a server that keeps handing back the same cursor.
      if (agents.length > 10_000) break;
    } while (cursor);

    return agents;
  }

  async getAgentUsage(agentId: string): Promise<CloudAgentUsage> {
    return this.request<CloudAgentUsage>(`/v1/agents/${encodeURIComponent(agentId)}/usage`, {
      bucket: 'agents',
    });
  }

  async getAgentRuns(agentId: string): Promise<CloudAgentRun[]> {
    const response = await this.request<CloudAgentRunsResponse>(
      `/v1/agents/${encodeURIComponent(agentId)}/runs`,
      { bucket: 'agents' },
    );
    return response.items ?? response.runs ?? [];
  }

  /** Preflight probe for Analytics API availability. */
  async getTeamDau(startTime = '7d', endTime = 'now'): Promise<unknown> {
    return this.request('/analytics/team/dau', {
      bucket: 'analytics',
      query: { startTime, endTime },
    });
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(seconds * 1000, 0);
  const date = new Date(header).getTime();
  if (Number.isNaN(date)) return undefined;
  return Math.max(date - Date.now(), 0);
}
