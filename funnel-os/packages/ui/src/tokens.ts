/**
 * tokens.ts — the single import surface for the design system.
 *
 * Components must never hard-code a colour, radius, shadow or duration. They
 * read the CSS custom properties emitted by @funnelos/tokens, which is what
 * makes "zero new CSS outside the token set" (exit gate A7) mechanically
 * checkable: if a value is not referenced here, the token build does not emit
 * it, and the gate can reject it.
 *
 * Every name below is asserted against the generated contract at test time
 * (src/test/tokens.test.ts). That assertion is not ceremony: the first draft of
 * this file guessed 13 names that do not exist — --ds-font-sans, --ds-shadow-sm,
 * --ds-motion-fast, --ds-delta-neutral, --ds-font-size-md, and others. None of
 * them would have thrown. A CSS custom property that is never declared resolves
 * to the empty string, so `background: var(--ds-shadow-sm)` silently becomes no
 * background and `color: var(--ds-delta-neutral)` silently inherits the parent
 * colour. A typo'd token is invisible in review and in a screenshot; it is
 * caught by asking the build what it actually emits.
 */

import type * as React from 'react';

/* -- spacing ------------------------------------------------------------- */
export const space = {
  '0': 'var(--ds-space-0)',
  '1': 'var(--ds-space-1)',
  '2': 'var(--ds-space-2)',
  '3': 'var(--ds-space-3)',
  '4': 'var(--ds-space-4)',
  '5': 'var(--ds-space-5)',
  '6': 'var(--ds-space-6)',
  '8': 'var(--ds-space-8)',
  '10': 'var(--ds-space-10)',
  '12': 'var(--ds-space-12)',
  '16': 'var(--ds-space-16)',
  '20': 'var(--ds-space-20)',
  '24': 'var(--ds-space-24)',
} as const;

/* -- radius -------------------------------------------------------------- */
export const radius = {
  none: 'var(--ds-radius-none)',
  sm: 'var(--ds-radius-sm)',
  md: 'var(--ds-radius-md)',
  lg: 'var(--ds-radius-lg)',
  xl: 'var(--ds-radius-xl)',
  '2xl': 'var(--ds-radius-2xl)',
  full: 'var(--ds-radius-full)',
} as const;

/* -- typography ---------------------------------------------------------- */
export const font = {
  family: {
    sans: 'var(--ds-font-family-sans)',
    mono: 'var(--ds-font-family-mono)',
  },
  size: {
    xs: 'var(--ds-font-size-xs)',
    sm: 'var(--ds-font-size-sm)',
    base: 'var(--ds-font-size-base)',
    lg: 'var(--ds-font-size-lg)',
    xl: 'var(--ds-font-size-xl)',
    '2xl': 'var(--ds-font-size-2xl)',
    '3xl': 'var(--ds-font-size-3xl)',
    '4xl': 'var(--ds-font-size-4xl)',
    '5xl': 'var(--ds-font-size-5xl)',
  },
  weight: {
    regular: 'var(--ds-font-weight-regular)',
    medium: 'var(--ds-font-weight-medium)',
    semibold: 'var(--ds-font-weight-semibold)',
    bold: 'var(--ds-font-weight-bold)',
  },
  lineHeight: {
    tight: 'var(--ds-font-line-height-tight)',
    snug: 'var(--ds-font-line-height-snug)',
    normal: 'var(--ds-font-line-height-normal)',
    relaxed: 'var(--ds-font-line-height-relaxed)',
  },
  tracking: {
    tight: 'var(--ds-font-tracking-tight)',
    normal: 'var(--ds-font-tracking-normal)',
    wide: 'var(--ds-font-tracking-wide)',
  },
} as const;

/* -- colour: the roles a component is permitted to use -------------------- *
 *
 * Namespaced, NOT flattened. The first two drafts of this file flattened
 * `surface`, `content`, `border` and `brand` into a single flat object, and
 * the key names collide across them: `subtle` exists in both surface and
 * border, and `inverse` existed in both content and border. In a flat object
 * the second declaration silently wins. `color.inverse` was returning
 * `--ds-border-inverse` — every "inverse text colour" was a border colour — and
 * nothing about that is visible in a screenshot.
 *
 * TypeScript caught it as TS1117 only because `noImplicitOverride`-adjacent
 * strictness flags duplicate literal keys. Flattening is how that class of bug
 * ships, so the groups stay separate.                                  */
export const color = {
  surface: {
    canvas: 'var(--ds-surface-canvas)',
    raised: 'var(--ds-surface-raised)',
    subtle: 'var(--ds-surface-subtle)',
    sunken: 'var(--ds-surface-sunken)',
    overlay: 'var(--ds-surface-overlay)',
    /** Dimming layer behind a modal. Theme-aware: 0.45 light, 0.7 dark,
     *  because a 0.45 scrim over a dark canvas is not a scrim. */
    scrim: 'var(--ds-surface-scrim)',
  },

  content: {
    primary: 'var(--ds-content-primary)',
    secondary: 'var(--ds-content-secondary)',
    tertiary: 'var(--ds-content-tertiary)',
    inverse: 'var(--ds-content-inverse)',
    /**
     * White on a saturated .solid fill. Theme-independent by design: a solid
     * fill is never light, so its label is never dark. This token exists
     * because --ds-content-inverse flips to neutral-900 in dark mode, which put
     * dark text on saturated 600 fills and measured 3.70:1 (danger) and 4.36:1
     * (info).
     */
    onSolid: 'var(--ds-content-on-solid)',
    link: 'var(--ds-content-link)',
  },

  border: {
    subtle: 'var(--ds-border-subtle)',
    default: 'var(--ds-border-default)',
    strong: 'var(--ds-border-strong)',
    focus: 'var(--ds-border-focus)',
    inverse: 'var(--ds-border-inverse)',
  },

  brand: {
    /** The solid fill: brand buttons, active tab underline, focus fill. */
    solid: 'var(--ds-color-primary-600)',
    accent: 'var(--ds-color-primary-500)',
    subtle: 'var(--ds-color-primary-100)',
    border: 'var(--ds-color-primary-300)',
  },

  status: {
    success: { fg: 'var(--ds-status-success-fg)', bg: 'var(--ds-status-success-bg)', solid: 'var(--ds-status-success-solid)' },
    warning: { fg: 'var(--ds-status-warning-fg)', bg: 'var(--ds-status-warning-bg)', solid: 'var(--ds-status-warning-solid)' },
    danger: { fg: 'var(--ds-status-danger-fg)', bg: 'var(--ds-status-danger-bg)', solid: 'var(--ds-status-danger-solid)' },
    info: { fg: 'var(--ds-status-info-fg)', bg: 'var(--ds-status-info-bg)', solid: 'var(--ds-status-info-solid)' },
  },

  /**
   * flat / positive / negative, not a "neutral" member. An unchanged metric is
   * `flat`, and the distinction survives being read aloud.
   */
  delta: {
    positive: 'var(--ds-delta-positive)',
    negative: 'var(--ds-delta-negative)',
    flat: 'var(--ds-delta-flat)',
  },
} as const;

/* -- interaction: the focus and hover contract, in tokens ---------------- */
export const interactive = {
  hover: 'var(--ds-interactive-hover)',
  active: 'var(--ds-interactive-active)',
  selected: 'var(--ds-interactive-selected)',
  focusRing: 'var(--ds-interactive-focus-ring)',
  focusWidth: 'var(--ds-focus-width)',
  focusRadius: 'var(--ds-focus-radius)',
  focusOffset: 'var(--ds-focus-offset)',
} as const;

/* -- control sizing ------------------------------------------------------ *
 * `targetMin` is the WCAG 2.2 target-size floor, carried as a token so a
 * regression in it is a token diff rather than a silent CSS edit.            */
export const size = {
  control: {
    sm: 'var(--ds-size-control-sm)',
    md: 'var(--ds-size-control-md)',
    lg: 'var(--ds-size-control-lg)',
  },
  targetMin: 'var(--ds-size-target-min)',
} as const;

/* -- component tokens ---------------------------------------------------- */
export const component = {
  button: {
    paddingX: {
      sm: 'var(--ds-button-padding-x-sm)',
      md: 'var(--ds-button-padding-x-md)',
      lg: 'var(--ds-button-padding-x-lg)',
    },
    radius: 'var(--ds-button-radius)',
    fontWeight: 'var(--ds-button-font-weight)',
  },
  card: {
    border: 'var(--ds-card-border)',
    padding: 'var(--ds-card-padding)',
    radius: 'var(--ds-card-radius)',
    shadow: 'var(--ds-card-shadow)',
  },
  field: {
    border: 'var(--ds-field-border)',
    borderFocus: 'var(--ds-field-border-focus)',
    labelGap: 'var(--ds-field-label-gap)',
    radius: 'var(--ds-field-radius)',
  },
  badge: {
    height: 'var(--ds-badge-height)',
    paddingX: 'var(--ds-badge-padding-x)',
    radius: 'var(--ds-badge-radius)',
  },
  table: {
    border: 'var(--ds-table-border)',
    headerBg: 'var(--ds-table-header-bg)',
    rowHover: 'var(--ds-table-row-hover)',
  },
} as const;

/* -- density (Phase 1 exit gate requires both) --------------------------- */
export const density = {
  row: {
    compact: 'var(--ds-density-row-compact)',
    comfortable: 'var(--ds-density-row-comfortable)',
  },
  cell: {
    compact: 'var(--ds-density-cell-pad-compact)',
    comfortable: 'var(--ds-density-cell-pad-comfortable)',
  },
  section: {
    compact: 'var(--ds-density-section-compact)',
    comfortable: 'var(--ds-density-section-comfortable)',
  },
} as const;

/* -- elevation ----------------------------------------------------------- */
export const shadow = {
  '0': 'var(--ds-shadow-0)',
  '1': 'var(--ds-shadow-1)',
  '2': 'var(--ds-shadow-2)',
  '3': 'var(--ds-shadow-3)',
  '4': 'var(--ds-shadow-4)',
} as const;

/* -- motion -------------------------------------------------------------- *
 * The reduced-motion override lives once, in styles.css, collapsing every
 * duration token to 0s. Components therefore carry no media query of their own
 * and cannot accidentally opt out of the user's preference.                  */
export const motion = {
  duration: {
    instant: 'var(--ds-motion-duration-instant)',
    fast: 'var(--ds-motion-duration-fast)',
    normal: 'var(--ds-motion-duration-normal)',
    slow: 'var(--ds-motion-duration-slow)',
    slower: 'var(--ds-motion-duration-slower)',
  },
  easing: {
    standard: 'var(--ds-motion-easing-standard)',
    entrance: 'var(--ds-motion-easing-entrance)',
    exit: 'var(--ds-motion-easing-exit)',
  },
} as const;

/* -- layout -------------------------------------------------------------- */
export const layout = {
  breakpoint: {
    sm: 'var(--ds-breakpoint-sm)',
    md: 'var(--ds-breakpoint-md)',
    lg: 'var(--ds-breakpoint-lg)',
    xl: 'var(--ds-breakpoint-xl)',
  },
  z: {
    base: 'var(--ds-z-base)',
    dropdown: 'var(--ds-z-dropdown)',
    sticky: 'var(--ds-z-sticky)',
    overlay: 'var(--ds-z-overlay)',
    modal: 'var(--ds-z-modal)',
    toast: 'var(--ds-z-toast)',
  },
  /**
   * Shell dimensions. These arrived with the OS app, which needed a nav-rail
   * width, a content max-width, a measure and a drawer width, and was about to
   * write four literals. They live here because three screens wanted the same
   * three values, and a value shared by three screens is a token.
   */
  navRailWidth: 'var(--ds-layout-nav-rail-width)',
  contentMax: 'var(--ds-layout-content-max)',
  measure: 'var(--ds-layout-measure)',
  drawerWidth: 'var(--ds-layout-drawer-width)',
} as const;

/* -- composed styles ----------------------------------------------------- *
 * These are the only non-token values in the system, and they exist so the
 * focus ring and the target floor are *identical* everywhere. Duplicating
 * them per component is how a checkbox ends up with a 2px ring and a 3px ring
 * elsewhere, and a drifted focus ring is invisible until a keyboard user
 * complains.                                                         */

/**
 * The focus indicator, composed from the focus tokens.
 *
 * `:focus-visible` is deliberately NOT a JS-driven state. React cannot
 * observe it, so a component that tried would have to reimplement the
 * heuristic — and get it wrong for keyboard users, who are exactly the people
 * the ring exists for. Pseudo-class state lives in styles.css instead.
 */
export const focusRingStyle: React.CSSProperties = {
  outline: 'none',
  boxShadow: `0 0 0 ${interactive.focusWidth} ${interactive.focusRing}`,
  borderRadius: radius.md,
};

/** The WCAG 2.2 target-size (minimum) floor, as a style fragment. */
export const minTargetStyle: React.CSSProperties = {
  minHeight: size.targetMin,
  minWidth: size.targetMin,
};

/**
 * Every CSS custom property a component is permitted to reference.
 *
 * Exported so the A7 gate can diff this list against what the token build
 * actually emits. A component that references a property outside this set is
 * using a token nobody declared, which renders as no-value rather than an
 * error - so the check has to be static, not visual.
 */
function collectProperties(node: unknown, into: Set<string>): void {
  if (typeof node === 'string') {
    // Pull the name out of `var(--ds-*)`. Values that are not a single var()
    // reference (composed expressions, plain lengths) are not token names and
    // are skipped rather than guessed at.
    const m = /^var\((--[a-z0-9-]+)\)$/i.exec(node);
    if (m?.[1]) into.add(m[1]);
    return;
  }
  if (node && typeof node === 'object') {
    // Recursive, not one level of flatMap. The first version flattened exactly
    // one level, which left nested groups like `font.size` and
    // `component.button.paddingX` as objects and threw `.replace is not a
    // function` on import - so the A7 gate had never actually run, it had only
    // ever been compiled.
    for (const child of Object.values(node)) collectProperties(child, into);
  }
}

const allowedSet = new Set<string>();
collectProperties(
  {
    space,
    radius,
    font,
    color,
    interactive,
    size,
    component,
    density,
    shadow,
    motion,
    layout,
  },
  allowedSet,
);

export const allowedCustomProperties: readonly string[] = [...allowedSet].sort();
