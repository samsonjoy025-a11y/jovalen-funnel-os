import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cx } from '../cx.js';
import { color, component, font, minTargetStyle, space, size } from '../tokens.js';

/**
 * Button.
 *
 * Built on Slot so it can render an <a> when given an href and stay a <button>
 * otherwise, without a separate component or a `as` prop that callers get
 * wrong. The element is chosen by whether `href` is present, which means the
 * accessible role follows the semantics automatically: an anchor with href is a
 * link, a button is a button. A link styled as a button that navigates must
 * announce as a link, or a screen-reader user cannot tell it will leave the
 * page.
 *
 * `.solid` fills always use --ds-content-on-solid, never --ds-content-inverse.
 * That is the whole reason that token exists: content-inverse flips to
 * neutral-900 in dark mode, which put dark text on a saturated 600 fill and
 * measured 3.70:1 on danger and 4.36:1 on info. See semantic.json.
 *
 * min-height is size.control.*, which is always >= size-target-min (24px), so
 * the WCAG 2.2 target-size floor holds for every variant without a per-variant
 * override that could be forgotten.
 */
export type ButtonVariant = 'solid' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders an <a href>. Changes the element, not the styling. */
  href?: string;
  /**
   * Render the single child instead of a <button>, merging these props onto it.
   *
   * For a router `<Link>`. `href` cannot cover that case: react-router's Link
   * navigates on click and needs a `to`, not an `href`, and passing `href`
   * alongside it produces an anchor that both navigates and hard-navigates.
   *
   * `asChild` rather than an `as: ElementType` prop. An `as` prop has to
   * accept the union of the button attributes and whatever the target element
   * needs — `to` for Link, `onSelect` for a menu item — which is `any` by the
   * time TypeScript is done, so every call site loses checking on the props it
   * does know. `asChild` keeps `ButtonProps` honest and lets the child's own
   * types check its own props:
   *
   *     <Button asChild variant="solid"><Link to="/analytics">See analytics</Link></Button>
   */
  asChild?: boolean;
  /** Announced while the action is in flight and prevents a second submit. */
  loading?: boolean;
  /** Icon-only buttons MUST supply this. An icon button with no name is an
   *  empty button to a screen reader. */
  iconOnlyLabel?: string;
  fullWidth?: boolean;
}

const paddingX: Record<ButtonSize, string> = {
  sm: component.button.paddingX.sm,
  md: component.button.paddingX.md,
  lg: component.button.paddingX.lg,
};

const controlHeight: Record<ButtonSize, string> = {
  sm: size.control.sm,
  md: size.control.md,
  lg: size.control.lg,
};

function surfaceFor(variant: ButtonVariant): React.CSSProperties {
  switch (variant) {
    case 'solid':
      return { background: color.brand.solid, color: color.content.onSolid, borderColor: 'transparent' };
    case 'danger':
      return { background: color.status.danger.solid, color: color.content.onSolid, borderColor: 'transparent' };
    case 'secondary':
      return { background: color.surface.sunken, color: color.content.primary, borderColor: 'transparent' };
    case 'outline':
      return { background: 'transparent', color: color.content.primary, borderColor: color.border.default };
    case 'ghost':
      return { background: 'transparent', color: color.content.link, borderColor: 'transparent' };
  }
}

export const Button = React.forwardRef<HTMLElement, ButtonProps>(
  function Button(
    {
      variant = 'solid',
      size: buttonSize = 'md',
      href,
      asChild = false,
      loading = false,
      iconOnlyLabel,
      fullWidth = false,
      disabled,
      children,
      style,
      type,
      ...rest
    },
    ref,
  ) {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space['2'],
      minHeight: controlHeight[buttonSize],
      padding: `0 ${paddingX[buttonSize]}`,
      borderRadius: component.button.radius,
      borderWidth: '1px',
      borderStyle: 'solid',
      font: `${component.button.fontWeight} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
      textDecoration: 'none',
      width: fullWidth ? '100%' : undefined,
      // The target floor is a style, not a prop. The first draft spread
      // `minTargetStyle` (a React.CSSProperties) into the element's props,
      // which TypeScript rejected — and rightly: CSSProperties carries ~900
      // optional keys, so the spread dragged in the HTML `translate` attribute
      // and would have emitted minHeight as a DOM attribute.
      // Icon-only buttons are square, so they get an explicit width floor.
      minWidth: iconOnlyLabel ? size.targetMin : undefined,
      ...surfaceFor(variant),
      ...style,
    };

    // Loading is expressed as aria-disabled rather than the disabled attribute:
    // a disabled button is removed from the tab order, so a user who triggers a
    // save and then wants to cancel loses the control entirely. Keeping it
    // focusable and announced as disabled preserves both.
    const a11y = {
      'aria-busy': (loading || undefined) as true | undefined,
      'aria-disabled': (disabled || loading ? true : undefined) as true | undefined,
      'aria-label': iconOnlyLabel,
    };

    const content = (
      <>
        {loading ? (
          <span
            aria-hidden="true"
            style={{
              width: space['3'],
              height: space['3'],
              borderRadius: '50%',
              border: `2px solid currentColor`,
              borderTopColor: 'transparent',
              display: 'inline-block',
            }}
          />
        ) : null}
        {children}
      </>
    );

    // The one place this component casts.
    //
    // A component that renders an <a> or a <button> has a prop bag that is
    // legitimately valid for both, and TypeScript cannot narrow it to both at
    // once: spreading button-typed handlers onto an anchor is an error, and
    // vice versa. Radix's Slot solves this by typing its props as `any`, which
    // throws away the checking for every consumer.
    //
    // The cast is confined to this one line rather than being pushed into the
    // public prop type, so a caller still gets full checking on everything they
    // pass in. The alternative — two components, Button and ButtonLink — would
    // duplicate the variant, size and state logic that has to stay identical
    // for a link to look like a button.
    const polymorphic = rest as React.AllHTMLAttributes<HTMLElement>;

    if (asChild) {
      /*
       * `Slot` merges onto the one child element. The child owns the tag, so
       * the role follows from whatever the caller wrote: a `Link` stays a link
       * and announces as one, which is what "this navigates" has to sound like.
       *
       * `children` must be exactly one element. A fragment or a bare string
       * would make Slot merge onto the wrapper rather than the intended target,
       * which throws rather than rendering something subtly wrong — a good
       * trade, because the alternative is a button class silently landing on a
       * <span>.
       */
      if (!React.isValidElement(children)) {
        throw new Error(
          `Button asChild needs exactly one element child, not ${children === undefined ? 'nothing' : typeof children}. ` +
            'Use the plain Button for actions, or wrap the element: <Button asChild><Link to="/x">…</Link></Button>.',
        );
      }
      return (
        <Slot
          {...rest}
          {...a11y}
          className={cx('ui-button', rest.className)}
          ref={ref}
          style={base}
        >
          {children}
        </Slot>
      );
    }

    if (href !== undefined) {
      return (
        <a
          {...polymorphic}
          {...a11y}
          className={cx('ui-button', rest.className)}
          ref={ref as React.Ref<HTMLAnchorElement> | null}
          href={href}
          style={base}
        >
          {content}
        </a>
      );
    }

    return (
      <button
        {...rest}
        {...a11y}
        className={cx('ui-button', rest.className)}
        ref={ref as React.Ref<HTMLButtonElement> | null}
        // Default to "button". A bare <button> inside a <form> submits, which
        // turns every secondary action in a form into an unintended submit.
        type={type ?? 'button'}
        disabled={disabled}
        style={base}
      >
        {content}
      </button>
    );
  },
);

/**
 * IconButton — a Button with no visible text.
 *
 * Kept as a distinct export rather than a Button variant because it makes
 * `iconOnlyLabel` structurally required. Making it optional and relying on
 * discipline is how unlabelled icon buttons ship.
 */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'iconOnlyLabel'> {
  /** Required. There is no default and no fallback: an unlabelled icon button
   *  is unusable with a screen reader. */
  label: string;
  children: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLElement, IconButtonProps>(
  function IconButton({ label, size: buttonSize = 'md', ...rest }, ref) {
    return (
      <Button
        {...rest}
        ref={ref}
        size={buttonSize}
        variant={rest.variant ?? 'ghost'}
        iconOnlyLabel={label}
        style={{ paddingInline: 0, aspectRatio: '1 / 1', ...rest.style }}
      >
        <span aria-hidden="true" style={{ display: 'inline-flex' }}>
          {rest.children}
        </span>
      </Button>
    );
  },
);
