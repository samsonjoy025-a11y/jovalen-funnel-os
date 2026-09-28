import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cx } from '../cx.js';
import { color, component, font, minTargetStyle, motion, space, size } from '../tokens.js';

/* -------------------------------------------------------------------------- *
 * Checkbox
 * -------------------------------------------------------------------------- */

export interface CheckboxProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, 'children'> {
  /** The visible label. A checkbox with no label is not operable by name. */
  label: React.ReactNode;
  /** Rendered instead of the box. The control still needs `label`. */
  children?: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * Checkbox — on Radix, so the hidden input, indeterminate state, and the
 * Space/Enter keyboard contract are not reimplemented.
 *
 * Radix renders a real <input type="checkbox"> visually hidden, so the control
 * participates in forms and in the accessibility tree natively. The visible box
 * is aria-hidden. That is the correct inversion: the thing the browser knows
 * about is the thing that must be findable.
 */
export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(function Checkbox({ label, children, description, id: idProp, disabled, ...rest }, ref) {
  const base = React.useId();
  const id = idProp ?? `${base}-checkbox`;
  const descId = `${base}-desc`;

  return (
    <div style={{ display: 'grid', gap: space['1'] }}>
      <div style={{ display: 'flex', gap: space['2'], alignItems: 'flex-start' }}>
        <CheckboxPrimitive.Root
          {...rest}
          ref={ref}
          id={id}
          className={cx('ui-checkbox', rest.className)}
          disabled={disabled}
          aria-describedby={description ? descId : undefined}
          style={{
            ...minTargetStyle,
            display: 'inline-grid',
            placeItems: 'center',
            width: space['4'],
            height: space['4'],
            minWidth: size.targetMin,
            minHeight: size.targetMin,
            padding: 0,
            borderRadius: component.field.radius,
            border: `1px solid ${color.border.default}`,
            background: color.surface.raised,
            flexShrink: 0,
          }}
        >
          <CheckboxPrimitive.Indicator
            style={{ display: 'grid', placeItems: 'center', color: color.content.onSolid }}
          >
            {children ?? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M2.5 6.2l2.3 2.3L9.5 3.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>

        <label
          htmlFor={id}
          style={{
            font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
            color: disabled ? color.content.tertiary : color.content.primary,
            cursor: disabled ? 'not-allowed' : 'pointer',
            minHeight: size.targetMin,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {label}
        </label>
      </div>

      {description ? (
        <p
          id={descId}
          style={{
            margin: 0,
            marginInlineStart: space['6'],
            font: `${font.weight.regular} ${font.size.xs}/${font.lineHeight.normal} ${font.family.sans}`,
            color: color.content.tertiary,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- *
 * Switch
 * -------------------------------------------------------------------------- */

export interface SwitchProps
  extends Omit<React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, 'children'> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

/**
 * Switch — for a setting that takes effect immediately. A switch that must be
 * confirmed with a Save button is a checkbox wearing the wrong control, because
 * a switch announces its state on every toggle and gives no "pending" signal.
 */
export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch({ label, description, id: idProp, disabled, ...rest }, ref) {
  const base = React.useId();
  const id = idProp ?? `${base}-switch`;
  const descId = `${base}-desc`;

  return (
    <div style={{ display: 'grid', gap: space['1'] }}>
      <div style={{ display: 'flex', gap: space['3'], alignItems: 'center' }}>
        <SwitchPrimitive.Root
          {...rest}
          ref={ref}
          id={id}
          className={cx('ui-switch', rest.className)}
          disabled={disabled}
          aria-describedby={description ? descId : undefined}
          style={{
            ...minTargetStyle,
            width: space['10'],
            height: space['6'],
            minWidth: size.targetMin,
            minHeight: size.targetMin,
            padding: space['1'],
            border: 'none',
            borderRadius: '999px',
            background: color.surface.sunken,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <SwitchPrimitive.Thumb
            className="ui-switch-thumb"
            style={{
              display: 'block',
              width: space['4'],
              height: space['4'],
              borderRadius: '50%',
              background: color.surface.raised,
              willChange: 'translate',
            }}
          />
        </SwitchPrimitive.Root>

        <label
          htmlFor={id}
          style={{
            font: `${font.weight.medium} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
            color: disabled ? color.content.tertiary : color.content.primary,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {label}
        </label>
      </div>

      {description ? (
        <p
          id={descId}
          style={{
            margin: 0,
            marginInlineStart: space['10'],
            font: `${font.weight.regular} ${font.size.xs}/${font.lineHeight.normal} ${font.family.sans}`,
            color: color.content.tertiary,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
});

/* -------------------------------------------------------------------------- *
 * RadioGroup
 * -------------------------------------------------------------------------- */

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>, 'children'> {
  options: readonly RadioOption[];
  /** Group label. Rendered as a <legend> so it is announced with the group. */
  legend: React.ReactNode;
  orientation?: 'vertical' | 'horizontal';
}

/**
 * RadioGroup — one of N. The legend is a real <legend> inside a <fieldset>,
 * not an aria-label, because a radio group is a question and the legend is what
 * states it. Radix renders role="radiogroup"; the fieldset gives the visible
 * text the native grouping semantics to match.
 */
/**
 * One radio + its label, as its own component.
 *
 * This exists purely so useId() is not called inside a .map(). Calling a hook
 * in a loop is a rules-of-hooks violation: React tracks hooks by call order,
 * not by identity, so adding or removing an option silently reassigns every
 * subsequent id — which unlabels the wrong radio, or points two labels at one
 * control. Extracting a component gives each option its own stable hook slot.
 */
function RadioItem({ option }: { option: RadioOption }): React.ReactElement {
  const id = React.useId();
  return (
    <div style={{ display: 'flex', gap: space['2'], alignItems: 'flex-start' }}>
      <RadioGroupPrimitive.Item
        id={id}
        value={option.value}
        disabled={option.disabled}
        className="ui-radio"
        style={{
          ...minTargetStyle,
          display: 'inline-grid',
          placeItems: 'center',
          width: space['4'],
          height: space['4'],
          minWidth: size.targetMin,
          minHeight: size.targetMin,
          padding: 0,
          borderRadius: '50%',
          border: `1px solid ${color.border.default}`,
          background: color.surface.raised,
          flexShrink: 0,
        }}
      >
        <RadioGroupPrimitive.Indicator
          style={{
            display: 'grid',
            placeItems: 'center',
            width: space['2'],
            height: space['2'],
            borderRadius: '50%',
            background: color.brand.solid,
          }}
        />
      </RadioGroupPrimitive.Item>
      <label
        htmlFor={id}
        style={{
          font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
          color: option.disabled ? color.content.tertiary : color.content.primary,
          display: 'grid',
          gap: space['1'],
        }}
      >
        <span>{option.label}</span>
        {option.description ? (
          <span style={{ font: `${font.size.xs}/${font.lineHeight.normal} ${font.family.sans}`, color: color.content.tertiary }}>
            {option.description}
          </span>
        ) : null}
      </label>
    </div>
  );
}

export const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupProps
>(function RadioGroup({ options, legend, orientation = 'vertical', ...rest }, ref) {
  return (
    <fieldset
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gap: space['2'],
      }}
    >
      <legend
        style={{
          padding: 0,
          marginBottom: space['2'],
          font: `${font.weight.medium} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
          color: color.content.primary,
        }}
      >
        {legend}
      </legend>

      <RadioGroupPrimitive.Root
        {...rest}
        ref={ref}
        aria-label={typeof legend === 'string' ? legend : undefined}
        style={{
          display: 'flex',
          flexDirection: orientation === 'horizontal' ? 'row' : 'column',
          gap: space['3'],
          border: 'none',
          margin: 0,
          padding: 0,
          flexWrap: 'wrap',
        }}
      >
        {options.map((opt) => (
          <RadioItem key={opt.value} option={opt} />
        ))}
      </RadioGroupPrimitive.Root>
    </fieldset>
  );
});

/* -------------------------------------------------------------------------- *
 * Progress
 * -------------------------------------------------------------------------- */

export interface ProgressProps {
  /** 0-100. Clamped, because a raw percentage from an API can exceed it. */
  value: number;
  label: string;
  showValue?: boolean;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
}

/**
 * Progress — a determinate bar.
 *
 * The bar is aria-hidden and the value lives in a visually hidden live region,
 * because role="progressbar" on the visual element makes a screen reader
 * announce "45%" while dragging, which is noise. Announcing at a throttled
 * interval instead is the reason for the hidden span.
 *
 * Note there is no `indeterminate` variant here on purpose: an undetermined
 * progress bar that never resolves is worse than a Skeleton, which at least
 * tells the user which region is loading.
 */
export function Progress({
  value,
  label,
  showValue = false,
  tone = 'brand',
}: ProgressProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value));
  const fill = {
    brand: color.brand.solid,
    success: color.status.success.fg,
    warning: color.status.warning.fg,
    danger: color.status.danger.fg,
  }[tone];

  return (
    <div style={{ display: 'grid', gap: space['1'] }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          font: `${font.weight.medium} ${font.size.xs}/${font.lineHeight.snug} ${font.family.sans}`,
          color: color.content.secondary,
        }}
      >
        <span>{label}</span>
        {showValue ? <span aria-hidden="true">{Math.round(clamped)}%</span> : null}
      </div>

      <ProgressPrimitive.Root
        value={clamped}
        aria-label={label}
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          height: space['2'],
          borderRadius: '999px',
          background: color.surface.sunken,
        }}
      >
        <ProgressPrimitive.Indicator
          style={{
            width: '100%',
            height: '100%',
            background: fill,
            transition: `translate ${motion.duration.normal} ${motion.easing.standard}`,
            translate: `${-100 + clamped}% 0`,
          }}
        />
      </ProgressPrimitive.Root>

      <span
        aria-live="polite"
        style={{
          position: 'absolute',
          width: space['1'],
          height: space['1'],
          padding: 0,
          // The classic visually-hidden clip, which needs a NEGATIVE margin to
          // pull its 4px box inside the 1px viewport. There is no
          // space-(-1) token, and inventing one would put a magic number in the
          // token set; the negation is expressed against an existing step.
          margin: `calc(${space['1']} * -1)`,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
          borderWidth: 0,
        }}
      >
        {label}: {Math.round(clamped)}%
      </span>
    </div>
  );
}
