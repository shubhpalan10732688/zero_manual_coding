/**
 * What a resource can be, and how to read a GitHub link.
 *
 * Separate from `resources.ts` because the submission form is a client component: importing
 * these from the module that opens a database pool would drag `pg` into the browser bundle,
 * and the build says so rather than shipping it.
 */

export type ResourceKind = 'repo' | 'doc' | 'tool' | 'video' | 'course';

export const RESOURCE_KINDS: { id: ResourceKind; label: string }[] = [
  { id: 'repo', label: 'Repository' },
  { id: 'doc', label: 'Documentation' },
  { id: 'tool', label: 'Tool' },
  { id: 'video', label: 'Talk or video' },
  { id: 'course', label: 'Course' },
];

/** `https://github.com/owner/name` and `github.com/owner/name` both yield `owner/name`. */
export function toRepoSlug(url: string): string | undefined {
  const match = url.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+\/[^/#?]+)/);
  return match?.[1]?.replace(/\.git$/, '');
}
