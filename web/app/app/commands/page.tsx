import { LibraryView } from '../library/LibraryView';
import type { SearchParams } from '../lib/shell';

export const metadata = { title: 'Commands · Zero Manual Coding' };

export default async function CommandsPage({ searchParams }: { searchParams: SearchParams }) {
  return <LibraryView kind="command" params={await searchParams} />;
}
