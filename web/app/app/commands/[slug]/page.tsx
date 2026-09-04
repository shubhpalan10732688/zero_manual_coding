import { AssetView } from '../../library/AssetView';
import type { SearchParams } from '../../lib/shell';

export default async function CommandPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  return <AssetView kind="command" slug={slug} isNew={search.new === '1'} />;
}
