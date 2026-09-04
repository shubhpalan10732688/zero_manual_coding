'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Icon } from '../app/ui/Icons';
import { LoginForm } from '../login/LoginForm';

/**
 * Signing in without leaving the wall.
 *
 * Somebody who has just read six achievements and wants to add their own should not be sent
 * to a full-page sign-in and left to find their way back. The dialog keeps the wall behind
 * it and carries the destination through, so the form they wanted is what they land on.
 *
 * One dialog for the whole page rather than one per button: the wall renders a like control
 * on every card, and nine copies of a sign-in form would be nine copies of its state as well.
 * The context carries only where the button wanted to go.
 *
 * When somebody is already signed in there is no dialog at all — every AuthLink is a plain
 * anchor, which is what it should have been all along.
 */

interface SignInApi {
  signedIn: boolean;
  open: (next: string) => void;
}

const SignInContext = createContext<SignInApi>({ signedIn: false, open: () => {} });

export function SignInGate({
  signedIn,
  children,
}: {
  signedIn: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [next, setNext] = useState('/app/board');

  const open = useCallback((destination: string) => {
    setNext(destination);
    dialog.current?.showModal();
    // showModal focuses the first focusable child, which is the close button. React applies
    // autoFocus at mount and the dialog mounts closed, so neither gets the caret into the
    // field somebody opened this to type in.
    dialog.current?.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
  }, []);

  // The backdrop is part of the dialog element rather than a child of it, so a click lands
  // on the dialog itself only when it missed everything inside.
  const onBackdropClick = useCallback((event: React.MouseEvent<HTMLDialogElement>) => {
    if (event.target === dialog.current) dialog.current?.close();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    dialog.current?.close();
  }, [signedIn]);

  return (
    <SignInContext.Provider value={{ signedIn, open }}>
      {children}

      {!signedIn && (
        <dialog ref={dialog} className="ui-modal" onClick={onBackdropClick}>
          <div className="ui-modal-card">
            <div className="ui-modal-head">
              <div>
                <h2>Sign in to continue</h2>
                <p>Your work email is enough. The Cursor API key is optional.</p>
              </div>
              <button
                type="button"
                className="ui-modal-close"
                onClick={() => dialog.current?.close()}
                aria-label="Close"
              >
                <Icon name="plus" size={16} className="ui-rotate-45" />
              </button>
            </div>

            <LoginForm next={next} compact />
          </div>
        </dialog>
      )}
    </SignInContext.Provider>
  );
}

/**
 * A link that becomes a sign-in prompt when there is nobody signed in.
 *
 * Rendered as a real anchor in the signed-in case so middle-click, copy-link and the status
 * bar preview all behave. The button case is a button because it opens a dialog rather than
 * going anywhere, and calling that a link would be a lie the keyboard notices.
 */
export function AuthLink({
  href,
  className,
  title,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const { signedIn, open } = useContext(SignInContext);

  if (signedIn) {
    return (
      <a className={className} href={href} title={title}>
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={className} title={title} onClick={() => open(href)}>
      {children}
    </button>
  );
}
