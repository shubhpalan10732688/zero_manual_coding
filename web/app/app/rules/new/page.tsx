import { NewAssetView } from '../../library/LibraryView';

export const metadata = { title: 'Write a rule · Zero Manual Coding' };

export default async function NewRulePage() {
  return <NewAssetView kind="rule" />;
}
