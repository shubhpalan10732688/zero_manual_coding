import { Card, Note } from '../../ui/Card';
import { Icon } from '../../ui/Icons';
import { Shell } from '../../ui/Shell';
import { shellContext } from '../../lib/shell';

import { PostForm } from './PostForm';

export const metadata = { title: 'Add an achievement · Zero Manual Coding' };

/**
 * Writing a board post.
 */
export default async function NewPostPage() {
  const { shellUser, nav, connection } = await shellContext();

  return (
    <Shell
      user={shellUser}
      nav={nav}
      connection={connection}
      title="Add an achievement"
      subtitle="One thing you got done, written up once, findable afterwards"
    >
      <div className="ui-col">
        <div className="ui-breadcrumb">
          <a href="/app/board">Zero Manual Coding</a>
          <span className="ui-breadcrumb-sep">/</span>
          <span>New achievement</span>
        </div>

        <Card>
          <Note>
            <Icon name="info" size={12} /> It does not have to be a feature. A migration nobody
            noticed, a flaky test finally fixed, an afternoon of tedium compressed into twenty
            minutes — those are the achievements this wall is least likely to get and most needs,
            because they are the ones colleagues can copy on Monday.
          </Note>
        </Card>

        <Card title="Your achievement">
          <PostForm />
        </Card>
      </div>
    </Shell>
  );
}
