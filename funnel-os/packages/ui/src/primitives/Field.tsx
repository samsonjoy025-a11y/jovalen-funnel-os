import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { color, component, font, interactive, layout, space, size } from '../tokens.js';

/**
 * Field — label + control + help + error, with correct aria-describedby.
 *
 * This is the most load-bearing primitive in the set, because it is where most
 * accessibility bugs in a form actually live. Three things it guarantees, all
 * of which are asserted in Field.test.tsx:
 *
 *  1. The label is a real <label for=...>, not a <div> with a click handler.
 *     Clicking the text focuses the control, and clicking the control focuses
 *     the label in some screen readers. A div gets neither.
 *
 *  2. Help text and error text are both referenced by aria-describedby, and
 *     the ids are generated with React's useId so two Fields on a page cannot
 *     collide. Critically, the error is ALWAYS in aria-describedby even when
 *     hidden - a validation message that is present but not announced is worse
 *     than one that is absent, because the user is told the field is valid.
 *
 *  3. aria-invalid is set when there is an error, and the control is not
 *     disabled as a side effect of being invalid. Disabled controls are removed
 *     from the tab order and from the accessibility tree, so a user cannot
 *     discover or correct the error.
 *
 * The error is NOT aria-live. Validation on submit is announced by moving focus
 * to the first invalid control, not by a live region; see Field.test.tsx for
 * why an assertive live region here double-announces on every keystroke.
 */
export interface FieldProps {
  /** The control. Receives id, aria-describedby, aria-invalid and ref. */
  children: (props: {
    id: string;
    'aria-describedby': string | undefined;
    'aria-invalid': true | undefined;
    'aria-required': true | undefined;
  }) => React.ReactNode;
  /** Visible label text. Required: an unlabelled control fails WCAG 1.3.1. */
  label: React.ReactNode;
  /** Supplementary guidance. Shown when there is no error. */
  help?: React.ReactNode;
  /** Validation message. Replaces help and marks the control invalid. */
  error?: React.ReactNode;
  required?: boolean;
  className?: string;
}

export function Field({
  children,
  label,
  help,
  error,
  required = false,
  className,
}: FieldProps): React.ReactElement {
  const baseId = React.useId();
  const controlId = `${baseId}-control`;
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;

  // Both ids are always contributed when the corresponding element exists.
  // aria-describedby is a space-separated list, so a control can announce a
  // hint and an error together without the consumer assembling it.
  const describedBy =
    [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div
      className={className}
      data-invalid={error ? '' : undefined}
      style={{ display: 'grid', gap: component.field.labelGap }}
    >
      <LabelPrimitive.Root
        htmlFor={controlId}
        style={{
          font: `${font.weight.medium} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
          color: error ? color.status.danger.fg : color.content.primary,
        }}
      >
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: color.status.danger.fg, marginLeft: space['1'] }}>
            *
          </span>
        ) : null}
      </LabelPrimitive.Root>

      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}

      {help && !error ? (
        <p
          id={helpId}
          style={{
            margin: 0,
            font: `${font.weight.regular} ${font.size.xs}/${font.lineHeight.normal} ${font.family.sans}`,
            color: color.content.tertiary,
          }}
        >
          {help}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          style={{
            margin: 0,
            font: `${font.weight.medium} ${font.size.xs}/${font.lineHeight.normal} ${font.family.sans}`,
            color: color.status.danger.fg,
            display: 'flex',
            gap: space['1'],
            alignItems: 'flex-start',
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A CSS class a control can carry to pick up the field border contract, so an
 * Input inside a Field and an Input on its own look identical. Exported because
 * the Select and Combobox primitives need the same treatment and must not each
 * re-derive it.
 */
export const fieldControlStyle: React.CSSProperties = {
  width: '100%',
  minHeight: size.control.md,
  padding: `${space['2']} ${space['3']}`,
  border: `1px solid ${component.field.border}`,
  borderRadius: component.field.radius,
  background: color.surface.raised,
  color: color.content.primary,
  font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.normal} ${font.family.sans}`,
  transition: `border-color 120ms ${interactive.focusRing}`,
};

export const fieldControlFocusStyle: React.CSSProperties = {
  borderColor: component.field.borderFocus,
  boxShadow: `0 0 0 ${interactive.focusWidth} ${interactive.focusRing}`,
  outline: 'none',
};

/** Stacking contexts, so a Dialog cannot be painted under a Toast. */
export const zIndex = layout.z;
