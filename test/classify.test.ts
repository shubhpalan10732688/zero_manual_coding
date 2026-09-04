import {
  chooseSummary,
  classifyWork,
  extractAgentId,
  extractTicketKeys,
  extractTicketKeysLoose,
  stripConventionalPrefix,
} from '../src/enrich/classify';

describe('classifyWork', () => {
  it('prefers the Jira issue type over anything inferred', () => {
    expect(
      classifyWork({ jiraIssueType: 'Bug', prTitle: 'feat: add thing', branch: 'cursor/feat-x' }),
    ).toEqual({ workType: 'bug', source: 'jira' });
  });

  it('falls back to the conventional-commit prefix in a PR title', () => {
    expect(classifyWork({ prTitle: 'feat(mic): BSD-29479 Support fastTrack flag' })).toEqual({
      workType: 'feature',
      source: 'pr_title',
    });
  });

  it('falls back to the branch when there is no PR title', () => {
    expect(classifyWork({ branch: 'mic/fix/BSD-29387-uploader-email-any-event' })).toEqual({
      workType: 'bug',
      source: 'branch',
    });
  });

  it('stays unknown rather than guessing from an agent title alone', () => {
    expect(classifyWork({})).toEqual({ workType: 'unknown', source: 'none' });
  });

  it('does not treat the word fix inside a sentence as a type', () => {
    expect(classifyWork({ prTitle: 'Attempt to fix the flaky uploader test' })).toEqual({
      workType: 'unknown',
      source: 'none',
    });
  });

  it('handles a breaking-change marker', () => {
    expect(classifyWork({ prTitle: 'feat(api)!: drop v1 endpoints' }).workType).toBe('feature');
  });

  it.each([
    ['Story', 'feature'],
    ['story', 'feature'],
    ['Bug', 'bug'],
    ['Defect', 'bug'],
    ['Task', 'chore'],
    ['Sub-task', 'chore'],
    ['Epic', 'feature'],
    ['Spike', 'chore'],
  ])('maps Jira type %s to %s', (jiraIssueType, expected) => {
    expect(classifyWork({ jiraIssueType }).workType).toBe(expected);
  });

  it('ignores an unrecognised Jira type and falls through', () => {
    expect(classifyWork({ jiraIssueType: 'Widget', prTitle: 'fix: thing' })).toEqual({
      workType: 'bug',
      source: 'pr_title',
    });
  });

  it.each([
    ['cursor/feat-BSD-29479-dsi-fasttrack-aa69', 'feature'],
    ['mic/fix/BSD-29387-uploader', 'bug'],
    ['hotfix/urgent', 'bug'],
    ['chore/bump-deps', 'chore'],
    ['docs/readme', 'docs'],
    ['cursor/dev-environment-setup-6f72', 'unknown'],
  ])('classifies branch %s as %s', (branch, expected) => {
    expect(classifyWork({ branch }).workType).toBe(expected);
  });
});

describe('extractTicketKeys', () => {
  it('finds a key in a PR title', () => {
    expect(extractTicketKeys('feat(mic): BSD-29479 Support fastTrack')).toEqual(['BSD-29479']);
  });

  it('finds keys across several inputs without duplicating', () => {
    expect(
      extractTicketKeys('BSD-29479 thing', 'cursor/feat-BSD-29479-x', 'relates to BSD-100'),
    ).toEqual(['BSD-29479', 'BSD-100']);
  });

  it('ignores lowercase words that merely look like keys', () => {
    expect(extractTicketKeys('cursor/relaunch-clear-metadataupdatedtoid-2067')).toEqual([]);
  });

  it('returns nothing for undefined input', () => {
    expect(extractTicketKeys(undefined)).toEqual([]);
  });

  it('does not treat a date as a ticket', () => {
    expect(extractTicketKeys('release 2026-08')).toEqual([]);
  });
});

describe('extractTicketKeysLoose', () => {
  it('prefers a strict match when one exists', () => {
    expect(extractTicketKeysLoose('BSD-29479', 'bsd-100')).toEqual(['BSD-29479']);
  });

  it('recovers a lowercased key from a branch name', () => {
    expect(extractTicketKeysLoose('cursor/bsd-28880-clear-metadata')).toEqual(['BSD-28880']);
  });

  it('ignores a trailing hex salt', () => {
    expect(extractTicketKeysLoose('cursor/dsi-fasttrack-aa69')).toEqual([]);
  });
});

describe('extractAgentId', () => {
  it('pulls the agent id out of a PR body stamped by Cursor', () => {
    const body =
      '<a href="https://cursor.com/agents/bc-c8c9eb68-e7e6-48b3-af67-3ca1b869aa69">Open in Web</a>';
    expect(extractAgentId(body)).toBe('bc-c8c9eb68-e7e6-48b3-af67-3ca1b869aa69');
  });

  it('handles the background-agent query form', () => {
    const body = 'https://cursor.com/background-agent?bcId=bc-c8c9eb68-e7e6-48b3-af67-3ca1b869aa69';
    expect(extractAgentId(body)).toBe('bc-c8c9eb68-e7e6-48b3-af67-3ca1b869aa69');
  });

  it('returns undefined when the body mentions no agent', () => {
    expect(extractAgentId('Just an ordinary pull request')).toBeUndefined();
    expect(extractAgentId(undefined)).toBeUndefined();
  });
});

describe('chooseSummary', () => {
  it('prefers the ticket summary, which a person wrote', () => {
    expect(
      chooseSummary({
        ticketSummary: 'MIC-BE - Support fastTrack flag',
        prTitle: 'feat: something',
        agentName: 'DSI fast-track',
      }),
    ).toEqual({ summary: 'MIC-BE - Support fastTrack flag', source: 'jira' });
  });

  it('falls back to the PR title with its type prefix removed', () => {
    expect(chooseSummary({ prTitle: 'feat(mic): Support fastTrack flag' })).toEqual({
      summary: 'Support fastTrack flag',
      source: 'pr_title',
    });
  });

  it('falls back to the agent name last', () => {
    expect(chooseSummary({ agentName: 'Csv upload search' })).toEqual({
      summary: 'Csv upload search',
      source: 'agent_name',
    });
  });

  it('reports no summary when nothing is available', () => {
    expect(chooseSummary({})).toEqual({ source: 'none' });
  });

  it('treats blank strings as absent', () => {
    expect(chooseSummary({ ticketSummary: '   ', prTitle: 'fix: real title' }).source).toBe(
      'pr_title',
    );
  });
});

describe('stripConventionalPrefix', () => {
  it('removes a scoped prefix', () => {
    expect(stripConventionalPrefix('feat(mic): do the thing')).toBe('do the thing');
  });

  it('leaves an unprefixed title alone', () => {
    expect(stripConventionalPrefix('Do the thing')).toBe('Do the thing');
  });

  it('never returns an empty string', () => {
    expect(stripConventionalPrefix('feat:')).toBe('feat:');
  });
});
