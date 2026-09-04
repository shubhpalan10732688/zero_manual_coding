'use client';

import { useState } from 'react';

import { Icon } from './Icons';

/**
 * Copies text to the clipboard and says so.
 *
 * The whole point of the shared library is that somebody takes a command or rule and puts it
 * into their own .cursor directory. A copy button with no acknowledgement leaves people
 * clicking it twice.
 */
export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'ui-btn ui-btn-ghost ui-btn-sm',
  onCopied,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  /** Fired after a successful copy, e.g. to record that an asset was taken. */
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context, which includes plain http on
      // anything other than localhost. Saying so beats a button that does nothing.
      setFailed(true);
    }
  };

  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {failed ? 'Press Ctrl+C' : copied ? copiedLabel : label}
    </button>
  );
}
