import { safeDestination } from '../web/app/login/destination';

/**
 * The sign-in dialog on the public landing page puts a destination into a query string, which
 * makes it something a stranger can write. These cases are the open-redirect payloads that
 * get reported: an absolute URL, a protocol-relative one the browser reads as a host, and a
 * path outside the workspace.
 */
describe('safeDestination', () => {
  it('keeps a workspace path, which is the whole point of carrying one', () => {
    expect(safeDestination('/app/board/new', '/app')).toBe('/app/board/new');
    expect(safeDestination('/app/board?tag=refactor', '/app')).toBe('/app/board?tag=refactor');
  });

  it('falls back when nothing was asked for', () => {
    expect(safeDestination(undefined, '/app/board')).toBe('/app/board');
    expect(safeDestination('', '/app/board')).toBe('/app/board');
  });

  it('refuses anywhere that is not the workspace', () => {
    expect(safeDestination('https://evil.test/app', '/app')).toBe('/app');
    expect(safeDestination('//evil.test/app', '/app')).toBe('/app');
    expect(safeDestination('/api/health', '/app')).toBe('/app');
    expect(safeDestination('javascript:alert(1)', '/app')).toBe('/app');
  });
});
