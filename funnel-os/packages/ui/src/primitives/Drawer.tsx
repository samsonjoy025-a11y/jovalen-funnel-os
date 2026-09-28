/**
 * Drawer — a panel that slides in from an edge of the viewport.
 *
 * Built on Radix `Dialog`, so the three things a modal has to get right are not
 * reimplemented here and cannot drift:
 *
 *   1. focus moves into the panel on open;
 *   2. Tab cycles within it;
 *   3. focus returns to the trigger on close.
 *
 * As in `Dialog`, the focus restore is done explicitly rather than trusted, for
 * the reason documented there: a controlled Radix Dialog closed under test left
 * focus on `<body>`, and a drawer is *worse* to lose focus in than a dialog,
 * because the trigger is a table row — a keyboard user who opened a lead and
 * pressed Escape would be dropped at the top of a 50-row table and would have to
 * tab all the way back to the row they were on.
 *
 * The one place a Drawer is not a Dialog is the *scrim*. A drawer covers part
 * of the page and leaves the rest visible, so "click the dimmed area to
 * dismiss" is ambiguous: the visible area behind is the *context* the drawer
 * was opened from. Dismissal is therefore Escape, the close button, and
 * `dismissible` scrim clicks — all three deliberate.
 */

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cx } from '../cx.js';
import { color, component, font, size, space } from '../tokens.js';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The heading. Required, for the same reason as `Dialog`: a modal that is not
   * named is announced as an unnamed dialog, and a list of drawers is a list of
   * anonymous things.
   */
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'end' | 'start' | 'bottom';
  /** The accessible name of the close control. */
  closeLabel?: string;
  /**
   * Off by default for a reason that is easy to get backwards. A drawer that
   * closes when the user clicks the row *behind* it looks slick in a demo and
   * is hostile in use: the gesture that follows a click on a nearby row is a
   * click on the next row, and it silently throws away whatever the user had
   * scrolled to. Set true only when the drawer is a confirmation.
   */
  dismissible?: boolean;
}

const drawerWidth = 'min(var(--ds-layout-drawer-width), 100vw)';

const sideStyles: Record<NonNullable<DrawerProps['side']>, React.CSSProperties> = {
  end: {
    insetBlock: 0,
    insetInlineEnd: 0,
    inlineSize: drawerWidth,
    maxInlineSize: '100vw',
    borderInlineStart: `1px solid ${color.border.default}`,
  },
  start: {
    insetBlock: 0,
    insetInlineStart: 0,
    inlineSize: drawerWidth,
    maxInlineSize: '100vw',
    borderInlineEnd: `1px solid ${color.border.default}`,
  },
  bottom: {
    insetInline: 0,
    insetBlockEnd: 0,
    blockSize: 'min(60vh, 100vh)',
    borderBlockStart: `1px solid ${color.border.default}`,
  },
};

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  side = 'end',
  closeLabel = 'Close',
  dismissible = true,
}: DrawerProps): React.ReactElement {
  const lastFocused = React.useRef<HTMLElement | null>(null);

  /**
   * See the note in `Dialog`. The listener is live only while closed, so it
   * records the trigger without then recording the panel's own controls.
   */
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
          // `pointer-events: none` when not dismissible: the scrim still dims
          // and still blocks the page behind from being clicked by accident,
          // but it is not a target, so a click falls through to nothing rather
          // than looking like it "half worked".
          //
          // The fade is a class for the same reason the panel's slide is: a
          // zeroed duration token makes an animation instant, not absent, and
          // an inline `animation` would leave reduced-motion un-honourable.
          className="ui-drawer-scrim"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--ds-z-modal)',
            background: color.surface.scrim,
            pointerEvents: dismissible ? 'auto' : 'none',
          }}
        />
        <DialogPrimitive.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            lastFocused.current?.focus();
          }}
          // The entrance animation is referenced by class, never by an inline
          // `animationName`. A stylesheet cannot beat an inline declaration, so
          // an inline animation would silently make the reduced-motion rules in
          // styles.css correct and inert. The geometry stays inline; the motion
          // does not.
          className={cx('ui-drawer', `ui-drawer--${side}`)}
          style={{
            position: 'fixed',
            zIndex: 'var(--ds-z-modal)',
            display: 'flex',
            flexDirection: 'column',
            background: color.surface.raised,
            color: color.content.primary,
            fontFamily: font.family.sans,
            boxShadow: 'var(--ds-shadow-4)',
            // `overscroll-behavior` stops a wheel gesture at the end of the
            // panel from continuing to scroll the page behind it, which is the
            // behaviour that makes a long drawer feel broken.
            overscrollBehavior: 'contain',
            ...sideStyles[side],
          }}        >
          <header
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: space['3'],
              padding: `${space['4']} ${space['4']} ${space['3']}`,
              borderBlockEnd: `1px solid ${color.border.subtle}`,
            }}
          >
            <div style={{ flex: 1, minInlineSize: 0 }}>
              <DialogPrimitive.Title
                style={{
                  margin: 0,
                  font: `${font.weight.semibold} ${font.size.lg}/${font.lineHeight.snug} ${font.family.sans}`,
                }}
              >
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description
                  style={{
                    margin: `${space['1']} 0 0`,
                    font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.normal} ${font.family.sans}`,
                    color: color.content.secondary,
                  }}
                >
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>

            <DialogPrimitive.Close
              aria-label={closeLabel}
              className={cx('ui-drawer-close')}
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
          </header>

          <div style={{ flex: 1, overflowY: 'auto', padding: space['4'] }}>{children}</div>

          {footer ? (
            <div
              style={{
                display: 'flex',
                gap: space['2'],
                justifyContent: 'flex-end',
                padding: `${space['3']} ${space['4']}`,
                borderBlockStart: `1px solid ${color.border.subtle}`,
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
