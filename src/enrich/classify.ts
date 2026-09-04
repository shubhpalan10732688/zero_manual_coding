/**
 * Deciding what a piece of agent work actually was.
 *
 * The guiding rule is that a declaration beats an inference. A Jira issue type was chosen
 * by a person, a conventional-commit prefix was typed by the author, and a branch name is
 * at least deliberate. An auto-generated agent title is none of those, so work that only
 * has a title stays "unknown" rather than being guessed into a category that would then
 * be counted and reported as fact.
 */

export type WorkType = 'feature' | 'bug' | 'chore' | 'refactor' | 'docs' | 'test' | 'unknown';

/** Ordered by trustworthiness; the first source to produce an answer wins. */
export type WorkTypeSource = 'jira' | 'pr_title' | 'branch' | 'none';

export interface ClassificationInput {
  jiraIssueType?: string;
  prTitle?: string;
  branch?: string;
}

export interface Classification {
  workType: WorkType;
  source: WorkTypeSource;
}

const CONVENTIONAL: Record<string, WorkType> = {
  feat: 'feature',
  feature: 'feature',
  fix: 'bug',
  bugfix: 'bug',
  hotfix: 'bug',
  bug: 'bug',
  chore: 'chore',
  build: 'chore',
  ci: 'chore',
  perf: 'refactor',
  refactor: 'refactor',
  style: 'refactor',
  docs: 'docs',
  doc: 'docs',
  test: 'test',
  tests: 'test',
};

const JIRA_TYPES: Record<string, WorkType> = {
  story: 'feature',
  'user story': 'feature',
  epic: 'feature',
  'new feature': 'feature',
  improvement: 'feature',
  task: 'chore',
  'sub-task': 'chore',
  subtask: 'chore',
  bug: 'bug',
  defect: 'bug',
  incident: 'bug',
  problem: 'bug',
  support: 'chore',
  spike: 'chore',
};

/** `feat(mic): ...` and `feat: ...`, but not the word "fix" buried in a sentence. */
const CONVENTIONAL_PREFIX = /^\s*([a-z]+)(?:\([^)]*\))?!?\s*:/i;

/** `cursor/feat-BSD-1-thing`, `mic/fix/BSD-2-thing`, `feature/thing`. */
const BRANCH_SEGMENT = /(?:^|[/_-])(feat|feature|fix|bugfix|hotfix|bug|chore|refactor|docs|test)(?:[/_-]|$)/i;

export function classifyWork(input: ClassificationInput): Classification {
  const fromJira = input.jiraIssueType && JIRA_TYPES[input.jiraIssueType.trim().toLowerCase()];
  if (fromJira) return { workType: fromJira, source: 'jira' };

  const prefix = input.prTitle?.match(CONVENTIONAL_PREFIX)?.[1]?.toLowerCase();
  const fromTitle = prefix ? CONVENTIONAL[prefix] : undefined;
  if (fromTitle) return { workType: fromTitle, source: 'pr_title' };

  const segment = input.branch?.match(BRANCH_SEGMENT)?.[1]?.toLowerCase();
  const fromBranch = segment ? CONVENTIONAL[segment] : undefined;
  if (fromBranch) return { workType: fromBranch, source: 'branch' };

  return { workType: 'unknown', source: 'none' };
}

/**
 * Jira keys such as BSD-29479. Requires the uppercase project prefix so ordinary
 * hyphenated words in a branch name are not mistaken for tickets.
 */
const TICKET_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

export function extractTicketKeys(...texts: (string | undefined)[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(TICKET_KEY)) {
      found.add(match[1] as string);
    }
  }
  return [...found];
}

/**
 * Branch names lowercase the ticket, as in `cursor/feat-bsd-29479-thing`, so a
 * case-insensitive pass runs when the strict one finds nothing.
 */
const LOOSE_TICKET_KEY = /\b([A-Za-z][A-Za-z0-9]{1,9}-\d+)\b/g;

export function extractTicketKeysLoose(...texts: (string | undefined)[]): string[] {
  const strict = extractTicketKeys(...texts);
  if (strict.length > 0) return strict;

  const found = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(LOOSE_TICKET_KEY)) {
      const candidate = match[1] as string;
      // A trailing hex suffix like `-aa69` is Cursor's branch salt, not a ticket.
      if (/^\d+$/.test(candidate.split('-')[1] ?? '')) found.add(candidate.toUpperCase());
    }
  }
  return [...found];
}

/** Cursor stamps a link to the agent into the PR body, which lets PRs be joined back. */
const AGENT_LINK = /cursor\.com\/(?:agents|background-agent)\?*[^"'\s]*?(bc-[0-9a-f-]{36})/i;

export function extractAgentId(prBody: string | undefined): string | undefined {
  return prBody?.match(AGENT_LINK)?.[1];
}

export interface SummaryInput {
  ticketSummary?: string;
  prTitle?: string;
  agentName?: string;
}

export type SummarySource = 'jira' | 'pr_title' | 'agent_name' | 'none';

/**
 * Picks the most human-written description available. A PR title keeps its conventional
 * prefix elsewhere, but not here: "feat(mic): support fastTrack" reads better as
 * "support fastTrack" once the type is shown in its own column.
 */
export function chooseSummary(input: SummaryInput): { summary?: string; source: SummarySource } {
  if (input.ticketSummary?.trim()) {
    return { summary: input.ticketSummary.trim(), source: 'jira' };
  }
  if (input.prTitle?.trim()) {
    return { summary: stripConventionalPrefix(input.prTitle), source: 'pr_title' };
  }
  if (input.agentName?.trim()) {
    return { summary: input.agentName.trim(), source: 'agent_name' };
  }
  return { source: 'none' };
}

export function stripConventionalPrefix(title: string): string {
  return title.replace(CONVENTIONAL_PREFIX, '').trim() || title.trim();
}

/** Presentation labels, kept next to the values they describe. */
export const WORK_TYPE_LABEL: Record<WorkType, string> = {
  feature: 'Feature',
  bug: 'Bug fix',
  chore: 'Chore',
  refactor: 'Refactor',
  docs: 'Docs',
  test: 'Tests',
  unknown: 'Unclassified',
};
