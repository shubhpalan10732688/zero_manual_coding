export interface TeamMember {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  isRemoved: boolean;
}

export interface MembersResponse {
  teamMembers: TeamMember[];
}

export interface DailyUsageRow {
  userId: number;
  day: string;
  date: number;
  email: string;
  isActive?: boolean;
  totalLinesAdded: number;
  totalLinesDeleted: number;
  acceptedLinesAdded: number;
  acceptedLinesDeleted: number;
  totalApplies: number;
  totalAccepts: number;
  totalRejects: number;
  totalTabsShown: number;
  totalTabsAccepted: number;
  composerRequests: number;
  chatRequests: number;
  agentRequests: number;
  cmdkUsages: number;
  subscriptionIncludedReqs?: number;
  apiKeyReqs?: number;
  usageBasedReqs?: number;
  bugbotUsages?: number;
  mostUsedModel: string | null;
  applyMostUsedExtension: string | null;
  tabMostUsedExtension: string | null;
  clientVersion: string | null;
}

/** Daily usage and audit logs use this shape. */
export interface StandardPagination {
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage?: boolean;
  totalCount?: number;
  totalUsers?: number;
}

export interface DailyUsageResponse {
  data: DailyUsageRow[];
  pagination?: StandardPagination;
  period?: { startDate: number; endDate: number };
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCents?: number;
  discountPercentOff?: number;
}

export interface UsageEvent {
  /** Epoch milliseconds, delivered as a string. */
  timestamp: string;
  userEmail?: string;
  serviceAccountId?: string;
  serviceAccountName?: string;
  cloudAgentId?: string;
  automationId?: string;
  conversationId?: string;
  model?: string;
  kind?: string;
  maxMode?: boolean;
  requestsCosts?: number;
  isTokenBasedCall?: boolean;
  isChargeable?: boolean;
  isHeadless?: boolean;
  tokenUsage?: TokenUsage;
  chargedCents?: number;
  cursorTokenFee?: number;
}

/** filtered-usage-events uses numPages/currentPage rather than page/totalPages. */
export interface UsageEventsPagination {
  numPages: number;
  currentPage: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage?: boolean;
}

export interface UsageEventsResponse {
  usageEvents: UsageEvent[];
  totalUsageEventsCount?: number;
  pagination?: UsageEventsPagination;
}

/** What the client hands back regardless of which envelope the endpoint used. */
export interface NormalizedPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  totalCount?: number;
}

export interface UsageEventFilters {
  userId?: string;
  email?: string;
  serviceAccountId?: string;
  cloudAgentId?: string;
  automationId?: string;
  hostingType?: 'CLOUD' | 'SELF_HOSTED' | 'SELF_HOSTED_POOL' | 'SELF_HOSTED_MACHINE';
}

/** Cloud Agents API. Everything below is reachable with a personal (user) key. */

export interface CloudAgent {
  id: string;
  name?: string;
  status?: string;
  env?: { type?: string; name?: string };
  repos?: { url?: string }[];
  url?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
}

export interface CloudAgentListResponse {
  items: CloudAgent[];
  nextCursor?: string;
}

export interface AgentTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalTokens?: number;
}

export interface AgentCost {
  /** List value of the tokens consumed. */
  rawCostCents?: number;
  /** What the subscription actually billed, often zero. */
  chargedCents?: number;
}

export interface CloudAgentUsage {
  totalUsage?: AgentTokenUsage;
  cost?: AgentCost;
  runs?: { id: string; usageUuid?: string; usage?: AgentTokenUsage; cost?: AgentCost }[];
}

export interface CloudAgentRun {
  id: string;
  agentId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  durationMs?: number;
  git?: { branches?: { repoUrl?: string; branch?: string; prUrl?: string }[] };
}

export interface CloudAgentRunsResponse {
  items?: CloudAgentRun[];
  runs?: CloudAgentRun[];
  nextCursor?: string;
}

export interface AiCodeCommit {
  commitHash: string;
  userId?: string;
  userEmail?: string;
  repoName?: string;
  branchName?: string;
  isPrimaryBranch?: boolean;
  commitSource?: string;
  totalLinesAdded?: number;
  totalLinesDeleted?: number;
  tabLinesAdded?: number;
  tabLinesDeleted?: number;
  composerLinesAdded?: number;
  composerLinesDeleted?: number;
  nonAiLinesAdded?: number;
  nonAiLinesDeleted?: number;
  message?: string;
  commitTs?: string;
  createdAt?: string;
}

export interface AiCodeCommitsResponse {
  items: AiCodeCommit[];
  totalCount: number;
  page: number;
  pageSize: number;
}
