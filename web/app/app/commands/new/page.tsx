import { NewAssetView } from '../../library/LibraryView';

export const metadata = { title: 'Write a command · Zero Manual Coding' };

export default async function NewCommandPage() {
  return <NewAssetView kind="command" />;
}
