/**
 * Temporary board-only release. Keep the extended workspace implementation and data
 * intact; re-enable this switch when integrations and the other sections return.
 * This is shared by server guards and UI so hiding a link cannot leave a feature active.
 */
export const EXTENDED_WORKSPACE_ENABLED: boolean = false;

export function workspacePathEnabled(pathname: string): boolean {
  if (EXTENDED_WORKSPACE_ENABLED) return true;
  return pathname === '/app/board' || pathname.startsWith('/app/board/');
}