import React, { ReactNode, cloneElement, isValidElement } from 'react';

interface FormFieldProps {
  /** Label text shown above the control. */
  label: string;
  /** Optional HTML id — when provided, the label's htmlFor points at it. */
  id?: string;
  /** Marks the field as required in the label (asterisk). */
  required?: boolean;
  /** Optional help/hint text below the control. */
  hint?: ReactNode;
  /** Optional inline error message (rendered with role="alert"). */
  error?: string;
  /** Custom classes for the label (defaults to the shared form-label look). */
  labelClassName?: string;
  /** Children — the actual input/select/textarea. */
  children: ReactNode;
}

/**
 * Standardized form-label + control + hint + error wrapper.
 *
 * Replaces the repeated `<label className="block text-xs font-black …">…`
 * + optional helper-text block used across modals. All text styling matches
 * the existing platform console look.
 *
 * Accessibility: when `error` is present the message is rendered with
 * `role="alert"` (announced by screen readers) and the child control is
 * linked to it via `aria-describedby` (its `id` plus `-error`) with
 * `aria-invalid` set. The label is associated through `htmlFor`.
 */
export function FormField({
  label,
  id,
  required,
  hint,
  error,
  labelClassName = 'block text-xs font-black text-slate-500 uppercase tracking-wider mb-1.5',
  children,
}: FormFieldProps) {
  const errorId = id && error ? `${id}-error` : undefined;

  // Link the control to its error message when one exists. The control is a
  // single input/select/textarea passed as children — clone it to inject the
  // attributes so callers don't have to remember.
  const control = errorId && isValidElement(children)
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, { 'aria-describedby': errorId, 'aria-invalid': true })
    : children;

  return (
    <div>
      <label htmlFor={id} className={labelClassName}>
        {label}
        {required && <span className="text-accent-500"> *</span>}
      </label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-[11px] font-bold text-error-500">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}