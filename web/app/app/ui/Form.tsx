import type { ReactNode } from 'react';

import { Icon } from './Icons';

/**
 * Form parts, so every form in the workspace labels and explains itself the same way.
 *
 * Each field takes a hint rather than relying on placeholder text. Placeholders vanish the
 * moment someone starts typing, which is exactly when an explanation of what belongs in the
 * box is most useful — and these forms ask for things like "how Cursor helped", where the
 * difference between a useful answer and a useless one is worth spelling out.
 */

export function Field({
  label,
  htmlFor,
  hint,
  optional,
  wide,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  optional?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'ui-field ui-field-wide' : 'ui-field'}>
      <label className="ui-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="ui-label-optional">optional</span>}
      </label>
      {children}
      {hint && <p className="ui-hint">{hint}</p>}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input {...rest} className={className ? `ui-input ${className}` : 'ui-input'} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea {...rest} className={className ? `ui-textarea ${className}` : 'ui-textarea'} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, children, ...rest } = props;
  return (
    <select {...rest} className={className ? `ui-select ${className}` : 'ui-select'}>
      {children}
    </select>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
  hint,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  hint?: string;
}) {
  return (
    <label className="ui-check">
      <input type="checkbox" name={name} value="on" defaultChecked={defaultChecked} />
      <span>
        {label}
        {hint && (
          <>
            <br />
            <span className="ui-hint">{hint}</span>
          </>
        )}
      </span>
    </label>
  );
}

export type AlertTone = 'bad' | 'good' | 'info' | 'warn';

const ALERT_ICON: Record<AlertTone, string> = {
  bad: 'alert',
  good: 'check',
  info: 'info',
  warn: 'alert',
};

export function Alert({ tone, children }: { tone: AlertTone; children: ReactNode }) {
  return (
    <div className={`ui-alert ui-alert-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]} size={15} />
      <span>{children}</span>
    </div>
  );
}

export function FormActions({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="ui-form-actions">
      {children}
      {hint && <p className="ui-hint">{hint}</p>}
    </div>
  );
}
