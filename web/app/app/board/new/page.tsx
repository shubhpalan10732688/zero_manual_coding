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
      <div className="ui-col ui-compose">
        <div className="ui-breadcrumb">
          <a href="/app/board">Zero Manual Coding</a>
          <span className="ui-breadcrumb-sep">/</span>
          <span>New achievement</span>
        </div>

        <div className="ui-compose-intro">
          <span className="ui-section-label">Contribute to the community</span>
          <h2>Every useful improvement has a story.</h2>
          <Note><Icon name="info" size={14} /> A small fix, a faster workflow, a new feature. Share what changed and how you got there.</Note>
        </div>

        <Card title="Your achievement">
          <PostForm />
        </Card>
      </div>
    </Shell>
  );
}
