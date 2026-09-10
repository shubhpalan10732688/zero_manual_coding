import { EXTENDED_WORKSPACE_ENABLED, workspacePathEnabled } from '../web/features';
import { safeDestination } from '../web/app/login/destination';

describe('temporary board-only release', () => {
  it('keeps the extended workspace switched off', () => {
    expect(EXTENDED_WORKSPACE_ENABLED).toBe(false);
  });

  it.each(['/app/board', '/app/board/', '/app/board/new', '/app/board/42'])(
    'keeps the achievement route %s available',
    (path) => expect(workspacePathEnabled(path)).toBe(true),
  );

  it.each([
    '/app', '/app/', '/app/impact', '/app/actions', '/app/connections',
    '/app/commands', '/app/commands/new', '/app/rules/example',
    '/app/resources', '/app/news', '/app/board-other',
  ])('disables %s, including as a post-login destination', (path) => {
    expect(workspacePathEnabled(path)).toBe(false);
    expect(safeDestination(path, '/app/board')).toBe('/app/board');
  });

  it.each([
    '/application', '/app/board/../connections', '/app/board/%2e%2e/connections',
    '/app/board/../../login', '/app\\board', '/app/board\n',
  ])('rejects a misleading or normalized destination: %s', (path) => {
    expect(safeDestination(path, '/app/board')).toBe('/app/board');
  });

  it('preserves board deep links and filters after sign-in', () => {
    const destination = '/app/board/42?from=wall#details';
    expect(safeDestination(destination, '/app/board')).toBe(destination);
  });
});