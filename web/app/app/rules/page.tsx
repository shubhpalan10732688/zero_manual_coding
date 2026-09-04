import { LibraryView } from '../library/LibraryView';
import type { SearchParams } from '../lib/shell';

export const metadata = { title: 'Rules · Zero Manual Coding' };

export default async function RulesPage({ searchParams }: { searchParams: SearchParams }) {
  return <LibraryView kind="rule" params={await searchParams} />;
}
