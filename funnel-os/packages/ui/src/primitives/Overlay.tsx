import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import { cx } from '../cx.js';
import { color, component, font, motion, space, size } from '../tokens.js';

/** Theme-aware dimming layer behind a modal. */
const scrim = 'var(--ds-surface-scrim)';

/* ========================================================================== *
 * Dialog
 * ========================================================================== */

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The heading. Required — a dialog with no title is announced as nothing. */
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** `sm` for confirmations, `lg` for a form. `full` is a mobile sheet. */
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Set false only for a destructive confirm where cancelling is impossible. */
  dismissible?: boolean;
  closeLabel?: string;
}

const dialogWidth = {
  sm: '24rem',
  md: '32rem',
  lg: '48rem',
  full: '100%',
} as const;

/**
 * Dialog.
 *
 * Focus trapping is not implemented here and must not be — Radix does it, and
 * it is tested in Dialog's own test file. The trap has three parts and all
 * three have to hold or a keyboard user escapes the dialog into the page
 * behind it and cannot find their way back:
 *
 *   1. On open, focus moves INTO the dialog. Not to the trigger behind it.
 *   2. Tab and Shift+Tab cycle within the dialog, wrapping at both ends.
 *   3. On close, focus returns to whatever opened it.
 *
 * The scroll lock and the aria-hidden on everything outside the dialog come
 * from Radix too. This component's own job is the semantics:
 *
 *   - `title` is required and wired as DialogTitle, so the dialog is announced
 *     by name. Without it the dialog opens as an unnamed modal, and a screen
 *     reader user hears "dialog" and nothing about what it is.
 *   - `description` is wired as DialogDescription and referenced by
 *     aria-describedby automatically, so it is read after the title.
 *   - Escape closes it, and so does a click on the scrim, but only when
 *     dismissible. A destructive confirmation must require a deliberate choice.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size: dialogSize = 'md',
  dismissible = true,
  closeLabel = 'Close',
}: DialogProps): React.ReactElement {
  /**
   * Where focus goes when the dialog closes.
   *
   * Radix's own restore is supposed to handle this and mostly does, but it is
   * not a guarantee we are willing to build on: a controlled Dialog closed
   * under test left focus on <body> indefinitely, so a keyboard user who
   * opened a dialog and pressed Escape was dropped at the top of the document
   * with no way back except tabbing through the whole page. That was measured,
   * not assumed — see src/test/overlay.test.tsx, "part 3".
   *
   * The value is tracked by a `focusin` listener that is live only while the
   * dialog is closed. Two other approaches were tried and both are wrong:
   *
   *   - Reading `document.activeElement` on every React commit misses the case
   *     that matters most. Clicking a button focuses it WITHOUT causing a
   *     render, so a commit-time snapshot still held <body> and focus was
   *     never restored.
   *   - Capturing on the render where `open` flips is worse: React runs child
   *     effects before parent effects, and the portal content is a child, so
   *     by the time a parent effect ran Radix had already moved focus into
   *     the dialog and the "previously focused element" would be the dialog's
   *     own first control.
   */
  const lastFocused = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    if (open) return;
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) lastFocused.current = event.target;
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--ds-z-modal)',
            background: scrim,
            animation: `funnelos-fade-in ${motion.duration.fast} ${motion.easing.entrance}`,
          }}
        />
        <DialogPrimitive.Content
          onCloseAutoFocus={(event) => {
            // Radix would do this itself; see the note on `lastFocused` for
            // the measurement that showed it does not always.
            event.preventDefault();
            lastFocused.current?.focus();
          }}
          style={{
            position: 'fixed',
            zIndex: 'var(--ds-z-modal)',
            insetBlockStart: '50%',
            insetInlineStart: '50%',
            translate: '-50% -50%',
            width: `min(${dialogWidth[dialogSize]}, calc(100vw - 2 * ${space['4']}))`,
            maxHeight: `calc(100vh - 2 * ${space['4']})`,
            overflowY: 'auto',
            padding: component.card.padding,
            background: color.surface.overlay,
            border: `1px solid ${color.border.default}`,
            borderRadius: component.card.radius,
            boxShadow: component.card.shadow,
            fontFamily: font.family.sans,
            color: color.content.primary,
            animation: `funnelos-fade-in ${motion.duration.fast} ${motion.easing.entrance}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: space['4'],
              alignItems: 'flex-start',
              marginBottom: children ? space['3'] : undefined,
            }}
          >
            <DialogPrimitive.Title
              style={{
                flex: 1,
                margin: 0,
                font: `${font.weight.semibold} ${font.size.lg}/${font.lineHeight.snug} ${font.family.sans}`,
                color: color.content.primary,
              }}
            >
              {title}
            </DialogPrimitive.Title>

            {dismissible ? (
              <DialogPrimitive.Close
                aria-label={closeLabel}
                style={{
                  minHeight: size.targetMin,
                  minWidth: size.targetMin,
                  display: 'inline-grid',
                  placeItems: 'center',
                  border: 'none',
                  borderRadius: component.field.radius,
                  background: 'transparent',
                  color: color.content.secondary,
                  fontSize: font.size.lg,
                  cursor: 'pointer',
                }}
              >
                <span aria-hidden="true">✕</span>
              </DialogPrimitive.Close>
            ) : null}
          </div>

          {description ? (
            <DialogPrimitive.Description
              style={{
                margin: `0 0 ${space['4']}`,
                font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.normal} ${font.family.sans}`,
                color: color.content.secondary,
              }}
            >
              {description}
            </DialogPrimitive.Description>
          ) : null}

          {children}

          {footer ? (
            <div
              style={{
                display: 'flex',
                gap: space['2'],
                justifyContent: 'flex-end',
                marginBlockStart: space['5'],
              }}
            >
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ========================================================================== *
 * Tabs
 * ========================================================================== */

export interface TabDefinition {
  value: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}

/**
 * Tabs.
 *
 * Two rules do the work and both are easy to get wrong:
 *
 *   1. Each tab has `aria-controls` and each panel has `aria-labelledby`
 *      pointing at each other. A tab list that does not link its panels
 *      announces four tab names and then no relationship, so the user has no
 *      way to know which panel belongs to which tab.
 *   2. The tab list is a real `role="tablist"` and the arrow keys move between
 *      tabs. Radix implements roving tabindex; a TabList that is just
 *      buttons makes the user Tab through four stops instead of one.
 */
export function Tabs({
  tabs,
  defaultValue,
  value,
  onValueChange,
  label,
}: {
  tabs: readonly TabDefinition[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  /** Names the group for assistive tech. Visible text lives in the tabs. */
  label: string;
}): React.ReactElement {
  return (
    <TabsPrimitive.Root defaultValue={defaultValue} value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List
        aria-label={label}
        style={{
          display: 'flex',
          gap: space['1'],
          borderBottom: `1px solid ${color.border.subtle}`,
        }}
      >
        {tabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className="ui-tabs-trigger"
            style={{
              minHeight: size.targetMin,
              padding: `${space['2']} ${space['3']}`,
              border: 'none',
              borderBottom: '2px solid transparent',
              background: 'transparent',
              color: color.content.secondary,
              font: `${font.weight.medium} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {tab.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>

      {tabs.map((tab) => (
        <TabsPrimitive.Content
          key={tab.value}
          value={tab.value}
          style={{
            paddingBlockStart: space['4'],
            font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.normal} ${font.family.sans}`,
            color: color.content.primary,
          }}
        >
          {tab.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}

/* ========================================================================== *
 * Tooltip
 * ========================================================================== */

/**
 * Tooltip.
 *
 * A tooltip is NOT a label. It is unavailable to touch, unavailable to anyone
 * who has not hovered or focused, and skipped in the tab order. Anything a user
 * must know belongs in a label or help text; a tooltip is for supplementary
 * detail. This is why `Tooltip` here cannot be the accessible name of a
 * control.
 *
 * It opens on focus as well as hover, and closes on Escape, because the
 * keyboard path is the one that is usually missing.
 */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}): React.ReactElement {
  return (
    <TooltipPrimitive.Provider delayDuration={200} skipDelayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            style={{
              zIndex: 'var(--ds-z-dropdown)',
              maxWidth: '18rem',
              padding: `${space['2']} ${space['3']}`,
              background: color.content.inverse,
              color: 'var(--ds-content-on-solid)',
              borderRadius: component.field.radius,
              font: `${font.weight.regular} ${font.size.xs}/${font.lineHeight.normal} ${font.family.sans}`,
              boxShadow: 'var(--ds-shadow-3)',
            }}
          >
            {content}
            <TooltipPrimitive.Arrow style={{ fill: color.content.inverse }} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

/* ========================================================================== *
 * SegmentedControl
 * ========================================================================== */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
}

/**
 * SegmentedControl — a small set of mutually exclusive options, all visible.
 *
 * Rendered as a real radio group, not a row of buttons. A button toggles an
 * action; a radio chooses one of a set. Screen-reader users are told "1 of 3"
 * with a radiogroup, which is the information they need to know they have
 * already chosen. Arrow keys move the selection, as the radiogroup contract
 * requires.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  legend,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  legend: string;
}): React.ReactElement {
  const name = React.useId();
  return (
    <div
      role="radiogroup"
      aria-label={legend}
      style={{
        display: 'inline-flex',
        gap: space['1'],
        padding: space['1'],
        border: `1px solid ${color.border.default}`,
        borderRadius: component.button.radius,
        background: color.surface.sunken,
      }}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <label
            key={opt.value}
            style={{
              display: 'inline-flex',
              minHeight: size.targetMin,
              alignItems: 'center',
              padding: `0 ${component.button.paddingX.md}`,
              borderRadius: 'calc(var(--ds-button-radius) - 2px)',
              background: selected ? color.surface.raised : 'transparent',
              boxShadow: selected ? 'var(--ds-shadow-1)' : undefined,
              color: opt.disabled ? color.content.tertiary : color.content.primary,
              font: `${font.weight.medium} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
            }}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              disabled={opt.disabled}
              onChange={() => onChange(opt.value)}
              style={{
                position: 'absolute',
                width: space['1'],
                height: space['1'],
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                clipPath: 'inset(50%)',
                whiteSpace: 'nowrap',
              }}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

/* ========================================================================== *
 * Breadcrumbs
 * ========================================================================== */

export interface Crumb {
  label: React.ReactNode;
  href?: string;
  /** The final crumb is the current page and is not a link. */
  current?: boolean;
}

/**
 * Breadcrumbs.
 *
 * Wrapped in a <nav aria-label="Breadcrumb"> containing an ordered list, because
 * a trail is a hierarchy and a screen reader should be able to say "list of 4
 * items". The current page is marked aria-current="page" AND is not a link —
 * a link to the page you are already on is a dead control.
 */
export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }): React.ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: space['1'],
          margin: 0,
          padding: 0,
          listStyle: 'none',
          font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
        }}
      >
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: space['1'] }}>
              {crumb.current || last ? (
                <span aria-current="page" style={{ color: color.content.primary, fontWeight: font.weight.medium }}>
                  {crumb.label}
                </span>
              ) : (
                <a href={crumb.href} style={{ color: color.content.link }}>
                  {crumb.label}
                </a>
              )}
              {last ? null : (
                <span aria-hidden="true" style={{ color: color.content.tertiary }}>
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ========================================================================== *
 * Pagination
 * ========================================================================== */

/**
 * Pagination.
 *
 * Rendered as a <nav> so it is reachable as a landmark. The current page is
 * marked aria-current="page" and is a non-interactive element rather than a
 * disabled button — a disabled button is skipped by some screen readers
 * entirely, so the user loses their position indicator.
 */
export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = 'Pagination',
}: {
  page: number;
  pageCount: number;
  onPageChange: (p: number) => void;
  label?: string;
}): React.ReactElement {
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  return (
    <nav aria-label={label} style={{ display: 'flex', gap: space['1'], alignItems: 'center' }}>
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        style={pageButtonStyle}
      >
        <span aria-hidden="true">‹</span>
        <span className={cx('ui-sr')}>Previous page</span>
      </button>

      {pages.map((p) =>
        p === page ? (
          <span
            key={p}
            aria-current="page"
            style={{
              ...pageButtonStyle,
              background: color.brand.solid,
              color: color.content.onSolid,
              borderColor: 'transparent',
              fontWeight: font.weight.semibold,
            }}
          >
            <span aria-hidden="true">{p}</span>
            {/* The whole name lives here, not as a suffix to the visible
                glyph. The first draft read ", go to page 3" — the comma was
                meant to join it to the visible number, but the visible number
                is aria-hidden, so the comma was announced as a leading comma
                in the button's name. */}
            <span className="ui-sr">Current page, page {p}</span>
          </span>
        ) : (
          <button key={p} type="button" onClick={() => onPageChange(p)} style={pageButtonStyle}>
            <span aria-hidden="true">{p}</span>
            <span className="ui-sr">Page {p}</span>
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        style={pageButtonStyle}
      >
        <span aria-hidden="true">›</span>
        <span className="ui-sr">Next page</span>
      </button>
    </nav>
  );
}

const pageButtonStyle: React.CSSProperties = {
  minWidth: size.targetMin,
  minHeight: size.targetMin,
  padding: `0 ${space['2']}`,
  border: `1px solid ${color.border.default}`,
  borderRadius: component.field.radius,
  background: color.surface.raised,
  color: color.content.primary,
  font: `${font.weight.medium} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`,
  cursor: 'pointer',
};

/* ========================================================================== *
 * Separator
 * ========================================================================== */

export function Separator({
  orientation = 'horizontal',
  label,
}: {
  orientation?: 'horizontal' | 'vertical';
  /** Gives the separator a name, making it a real separator landmark. */
  label?: string;
}): React.ReactElement {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      aria-label={label}
      style={{
        ...(orientation === 'horizontal'
          ? { blockSize: '1px', inlineSize: '100%' }
          : { inlineSize: '1px', alignSelf: 'stretch' }),
        background: color.border.subtle,
      }}
    />
  );
}
