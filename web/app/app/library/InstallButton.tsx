'use client';

import { CopyButton } from '../ui/CopyButton';

import { recordCopyAction } from './mutations';

/**
 * Copy, and count it.
 *
 * We cannot see what anybody actually installed — a command lives in their repository, not in
 * our database. A recorded copy is the nearest honest signal, so the count is labelled "copies"
 * everywhere rather than "installs". The increment is fire-and-forget: failing to record it
 * must never stop the paste from working.
 */
export function InstallButton({
  id,
  text,
  label = 'Copy',
  className = 'ui-btn ui-btn-primary',
}: {
  id: number;
  text: string;
  label?: string;
  className?: string;
}) {
  return (
    <CopyButton
      text={text}
      label={label}
      copiedLabel="Copied"
      className={className}
      onCopied={() => {
        void recordCopyAction(id).catch(() => undefined);
      }}
    />
  );
}
