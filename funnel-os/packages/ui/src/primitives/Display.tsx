import * as React from 'react';
import * as VisuallyHiddenPrimitive from '@radix-ui/react-visually-hidden';
import { color, component, font, motion, space, size } from '../tokens.js';

/* -------------------------------------------------------------------------- *
 * Badge / StatusPill
 * -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

function toneColors(tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'brand':
      return { fg: color.brand.solid, bg: color.brand.subtle };
    case 'success':
      return { fg: color.status.success.fg, bg: color.status.success.bg };
    case 'warning':
      return { fg: color.status.warning.fg, bg: color.status.warning.bg };
    case 'danger':
      return { fg: color.status.danger.fg, bg: color.status.danger.bg };
    case 'info':
      return { fg: color.status.info.fg, bg: color.status.info.bg };
    case 'neutral':
      return { fg: color.content.secondary, bg: color.surface.sunken };
  }
}

export interface BadgeProps {
  children: React.ReactNode;
  tone?: Tone;
  /**
   * A coloured dot alone is not an accessible signal — it carries no meaning
   * in text. When a dot is shown, `dotLabel` is announced so the colour is
   * never the only carrier of the status.
   */
  dotLabel?: string;
}

/**
 * Badge — a small count or label.
 *
 * Tone is never the only carrier of meaning: the text is always present, and
 * the dot is accompanied by a visually hidden label. This is WCAG 1.4.1 (use of
 * colour) and it matters more here than in most products, because tone is
 * carrying state-machine meaning (§57, §66, §70) that a user has to act on.
 */
export function Badge({ children, tone = 'neutral', dotLabel }: BadgeProps): React.ReactElement {
  const { fg, bg } = toneColors(tone);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space['1'],
        height: component.badge.height,
        paddingInline: component.badge.paddingX,
        borderRadius: component.badge.radius,
        background: bg,
        color: fg,
        font: `${font.weight.semibold} ${font.size.xs}/${font.lineHeight.tight} ${font.family.sans}`,
        whiteSpace: 'nowrap',
      }}
    >
      {dotLabel ? (
        <>
          <span aria-hidden="true" style={{ width: space['2'], height: space['2'], borderRadius: '50%', background: fg }} />
          <VisuallyHidden>{dotLabel}: </VisuallyHidden>
        </>
      ) : null}
      {children}
    </span>
  );
}

/** StatusPill — a Badge that is explicitly a state, with a mandatory label. */
export function StatusPill({
  children,
  tone = 'neutral',
  dotLabel,
}: BadgeProps): React.ReactElement {
  return <Badge tone={tone} dotLabel={dotLabel ?? 'Status'}>{children}</Badge>;
}

/* -------------------------------------------------------------------------- *
 * Card
 * -------------------------------------------------------------------------- */

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** `raised` lifts with a shadow. `flat` is for nested surfaces. */
  elevation?: 'flat' | 'raised';
  padding?: 'none' | 'default';
  /**
   * `li` is the reason this is not just a div. A card inside a list must be a
   * real list item or the list's item count is wrong for everyone navigating by
   * list. The prop is typed on HTMLElement rather than HTMLDivElement so the
   * event handlers stay valid for all four elements.
   */
  as?: 'div' | 'section' | 'article' | 'li';
}

/**
 * Card — a surface, not a layout primitive.
 *
 * `as` exists so a card can be a real <article> or <li> in a list, which
 * changes what a screen reader announces when navigating by landmark or list.
 * Defaulting every card to a <div> loses that structure, and the fix is not
 * possible from CSS.
 */
export function Card({
  elevation = 'raised',
  padding = 'default',
  as: Tag = 'div',
  style,
  children,
  ...rest
}: CardProps): React.ReactElement {
  return (
    <Tag
      {...rest}
      style={{
        background: color.surface.raised,
        border: `1px solid ${component.card.border}`,
        borderRadius: component.card.radius,
        boxShadow: elevation === 'raised' ? component.card.shadow : undefined,
        padding: padding === 'default' ? component.card.padding : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- *
 * Alert
 * -------------------------------------------------------------------------- */

export interface AlertProps {
  children: React.ReactNode;
  tone?: Tone;
  title?: React.ReactNode;
  /**
   * Whether to announce on appearance. Only the one that appears in direct
   * response to a user action should be assertive; a page-load error banner
   * announced assertively interrupts whatever the user was doing.
   */
  live?: 'polite' | 'assertive' | 'off';
  action?: React.ReactNode;
}

/**
 * Alert — an inline message.
 *
 * Tones map to the status ramps, whose fg-on-bg pairs are in the 66-pair
 * contrast gate, so an Alert cannot be recoloured into an AA failure without
 * the token build failing.
 */
export function Alert({
  children,
  tone = 'info',
  title,
  live = 'off',
  action,
}: AlertProps): React.ReactElement {
  const { fg, bg } = toneColors(tone);
  const glyph = { success: '✓', warning: '!', danger: '⚠', info: 'i', brand: 'i', neutral: 'i' }[tone];

  return (
    <div
      role={live === 'off' ? 'note' : live === 'assertive' ? 'alert' : 'status'}
      aria-live={live === 'off' ? undefined : live}
      style={{
        display: 'flex',
        gap: space['3'],
        padding: space['3'],
        borderRadius: component.card.radius,
        border: `1px solid ${fg}`,
        background: bg,
        color: color.content.primary,
      }}
    >
      <span aria-hidden="true" style={{ color: fg, fontWeight: font.weight.bold, lineHeight: font.lineHeight.tight }}>
        {glyph}
      </span>
      <div style={{ display: 'grid', gap: space['1'], flex: 1, minWidth: 0 }}>
        {title ? (
          <strong style={{ font: `${font.weight.semibold} ${font.size.sm}/${font.lineHeight.snug} ${font.family.sans}`, color: fg }}>
            {title}
          </strong>
        ) : null}
        <div style={{ font: `${font.weight.regular} ${font.size.sm}/${font.lineHeight.normal} ${font.family.sans}` }}>
          {children}
        </div>
      </div>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Spinner
 * -------------------------------------------------------------------------- */

/**
 * Spinner — indeterminate busy indicator.
 *
 * Announced through a visually hidden live region rather than role="status" on
 * the element, so the announcement happens once when it appears instead of on
 * every animation frame boundary some screen readers produce.
 */
export function Spinner({ label = 'Loading' }: { label?: string }): React.ReactElement {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space['2'] }}>
      <span
        aria-hidden="true"
        className="ui-spinner"
        style={{
          display: 'inline-block',
          width: space['4'],
          height: space['4'],
          borderRadius: '50%',
          border: `2px solid ${color.surface.sunken}`,
          borderTopColor: color.brand.solid,
          animation: `funnelos-spin ${motion.duration.slow} linear infinite`,
        }}
      />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}

/* -------------------------------------------------------------------------- *
 * Skeleton
 * -------------------------------------------------------------------------- */

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  /** Number of stacked bars. `lines` is more honest than a caller mapping. */
  lines?: number;
}

/**
 * Skeleton — a placeholder for content that has not arrived.
 *
 * aria-hidden, always. A skeleton is a shape, not content; announcing "image"
 * or "text" for a grey box is noise, and it is the single most common way a
 * loading state becomes inaccessible. The loading state is announced once, by
 * whatever owns the async operation.
 */
export function Skeleton({ width, height, radius, lines }: SkeletonProps): React.ReactElement {
  const shared = {
    display: 'block' as const,
    borderRadius: radius ?? component.field.radius,
  };
  const bar = (
    <span
      aria-hidden="true"
      className="ui-skeleton ui-skeleton-shimmer"
      style={{ ...shared, width: width ?? '100%', height: height ?? space['3'] }}
    />
  );
  if (!lines) return bar;
  return (
    <span style={{ display: 'grid', gap: space['2'] }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="ui-skeleton ui-skeleton-shimmer"
          style={{
            ...shared,
            height,
            // Last line short, the way a paragraph of text actually ends.
            width: i === lines - 1 ? '60%' : (width ?? '100%'),
          }}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- *
 * Avatar
 * -------------------------------------------------------------------------- */

export interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Avatar — an image or the person's initials.
 *
 * The accessible name is the person's name, and the image is aria-hidden with
 * the name carried on the container instead. Otherwise the name is announced
 * twice, or the image's own alt text fights the visible initials.
 */
export function Avatar({ name, src, size: avatarSize = 'md' }: AvatarProps): React.ReactElement {
  const px = { sm: space['6'], md: space['8'], lg: space['12'] }[avatarSize];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      role="img"
      aria-label={name}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        inlineSize: px,
        blockSize: px,
        borderRadius: '50%',
        overflow: 'hidden',
        background: color.brand.subtle,
        color: color.brand.solid,
        font: `${font.weight.semibold} ${font.size.xs}/${font.lineHeight.tight} ${font.family.sans}`,
        flexShrink: 0,
      }}
    >
      {src ? <img src={src} alt="" aria-hidden="true" style={{ inlineSize: '100%', blockSize: '100%', objectFit: 'cover' }} /> : initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- *
 * Kbd
 * -------------------------------------------------------------------------- */

/** Kbd — a key or key combination. `keys` renders the standard separator. */
export function Kbd({ keys }: { keys: readonly string[] }): React.ReactElement {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space['1'],
        padding: `${space['1']} ${space['2']}`,
        minHeight: size.targetMin,
        borderRadius: component.field.radius,
        border: `1px solid ${color.border.default}`,
        borderBottomWidth: '2px',
        background: color.surface.sunken,
        color: color.content.secondary,
        font: `${font.weight.medium} ${font.size.xs}/${font.lineHeight.tight} ${font.family.mono}`,
      }}
    >
      {keys.map((k, i) => (
        <React.Fragment key={k}>
          {i > 0 ? <span aria-hidden="true" style={{ color: color.content.tertiary }}>+</span> : null}
          {k}
        </React.Fragment>
      ))}
    </kbd>
  );
}

/* -------------------------------------------------------------------------- *
 * VisuallyHidden / SkipLink
 * -------------------------------------------------------------------------- */

export const VisuallyHidden = VisuallyHiddenPrimitive.Root;

/**
 * SkipLink — the first focusable element on the page.
 *
 * Rendered off-screen rather than display:none, because display:none removes it
 * from the tab order and a skip link that cannot be focused is not a skip link.
 * It becomes visible on focus.
 */
export function SkipLink({ href = '#main', children = 'Skip to main content' }: { href?: string; children?: React.ReactNode }): React.ReactElement {
  return (
    <a href={href} className="ui-skip-link">
      {children}
    </a>
  );
}
