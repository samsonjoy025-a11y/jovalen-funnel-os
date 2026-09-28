import * as React from 'react';
import { cx } from '../cx.js';
import { color, component, font, interactive, space, size } from '../tokens.js';
import { fieldControlStyle } from './Field.js';

/**
 * Input — a single-line text control.
 *
 * Deliberately unopinionated about validation: it takes the ARIA attributes
 * Field computes and forwards them. It does not decide what is valid, because
 * the answer depends on the field's meaning and belongs to the screen, not the
 * primitive. The primitive's whole job is to render exactly what it is told so
 * that Field's aria wiring reaches the actual focusable element.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean;
  /** Leading adornment. Must be decorative or already labelled. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, leading, trailing, style, ...rest },
  ref,
) {
  const [focused, setFocused] = React.useState(false);
  const invalidNow = invalid ?? rest['aria-invalid'];

  const control: React.CSSProperties = {
    ...fieldControlStyle,
    borderColor: invalidNow ? color.status.danger.fg : focused ? component.field.borderFocus : component.field.border,
    boxShadow: focused ? `0 0 0 ${interactive.focusWidth} ${interactive.focusRing}` : undefined,
    paddingInlineStart: leading ? space['8'] : undefined,
    paddingInlineEnd: trailing ? space['8'] : undefined,
    ...style,
  };

  const input = (
    <input
      {...rest}
      ref={ref}
      className={cx('ui-field-control', rest.className)}
      aria-invalid={invalidNow}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={control}
    />
  );

  if (!leading && !trailing) return input;

  return (
    <span style={{ position: 'relative', display: 'block' }}>
      {leading ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetInlineStart: space['3'],
            insetBlockStart: '50%',
            translate: '0 -50%',
            color: color.content.tertiary,
            display: 'inline-flex',
            pointerEvents: 'none',
          }}
        >
          {leading}
        </span>
      ) : null}
      {input}
      {trailing ? (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            insetInlineEnd: space['3'],
            insetBlockStart: '50%',
            translate: '0 -50%',
            color: color.content.tertiary,
            display: 'inline-flex',
            pointerEvents: 'none',
          }}
        >
          {trailing}
        </span>
      ) : null}
    </span>
  );
});

/** Textarea — multi-line. Shares the field contract, adds vertical resize. */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, style, rows = 4, ...rest }, ref) {
  const [focused, setFocused] = React.useState(false);
  const invalidNow = invalid ?? rest['aria-invalid'];
  return (
    <textarea
      {...rest}
      ref={ref}
      rows={rows}
      aria-invalid={invalidNow}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      className={cx('ui-field-control', rest.className)}
      style={{
        ...fieldControlStyle,
        minHeight: size.control.lg,
        lineHeight: font.lineHeight.normal,
        resize: 'vertical',
        borderColor: invalidNow ? color.status.danger.fg : focused ? component.field.borderFocus : component.field.border,
        boxShadow: focused ? `0 0 0 ${interactive.focusWidth} ${interactive.focusRing}` : undefined,
        ...style,
      }}
    />
  );
});
