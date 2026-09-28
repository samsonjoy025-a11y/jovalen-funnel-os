# `@funnelos/ui` — the design system

Phase 1 §1.2 of [`docs/IMPLEMENTATION_PLAN_v2.md`](../../docs/IMPLEMENTATION_PLAN_v2.md).
Accessibility is structural here, not a Phase 13 audit: the plan's rule is that
contrast, focus, target size and reduced motion are token-level guarantees
validated in CI from week 3.

## Status: 26 of 39 primitives

| | Count | |
|---|---|---|
| Built | **26** | every one has a test asserting a named accessibility property |
| Remaining | **13** | see below |
| Composites (§1.3) | **0 of 25** | deliberately not started — see "Why no composites" |

### Built

`Button · IconButton · Input · Textarea · Checkbox · Switch · RadioGroup ·
Progress · Field · Badge · StatusPill · Card · Alert · Spinner · Skeleton ·
Avatar · Kbd · VisuallyHidden · SkipLink · Dialog · Tabs · Tooltip ·
SegmentedControl · Breadcrumbs · Pagination · Separator`

`Separator` is an addition, not in the plan's list; the other 25 are.

### Not yet built

`Link · Select · Combobox · Slider · DateRangePicker · Form · Popover ·
DropdownMenu · Drawer · Accordion · Toast · TagInput · TablePrimitives · Stepper`

The Radix packages for most of these (`react-select`, `react-popover`,
`react-dropdown-menu`, `react-slider`, `react-toast`) are already installed and
currently unused — installed up front so the install cost is paid once.

### Why no composites

The plan's §1.3 table says each composite **encodes a PRD requirement**, and
cites specific sections: `DataTable` → per-field permission masking,
`AsyncBoundary` → the five §87 states, `PlanVsMeasuredBadge` → the §104 honesty
rule, `RecommendationCard` → §64's ten fields.

**The PRD is not in this repository.** The plan paraphrases it, and the
paraphrase does not contain §73's 17 event names, §64's field list, §24's
block schema, or §115's definition of done. Building `AsyncBoundary` from a
one-line description would produce a component whose states look authoritative
and are guesses — and the next reader would have no way to tell.

A wrong composite is worse than an absent one, because an absent one is
obviously absent. The primitives are the right thing to build first anyway:
they encode no PRD requirements, they are the layer everything else sits on,
and they are fully verifiable today.

## The three rules

**1. No values, only references.** Every colour, radius, shadow and duration in
a component is a `var(--ds-*)`. `src/test/tokens.test.ts` scans the component
sources for `#hex`, `rgb()`, `hsl()` and named colours, and cross-checks every
custom property against what `@funnelos/tokens` actually emits. This is exit
gate A7, and it is mechanical.

The reason it has to be mechanical: a mistyped custom property does not throw.
The browser resolves `var(--ds-shadow-sm)` to the empty string, so the
declaration simply does not apply. The component is visually broken, ships, and
passes every other test. The first draft of `tokens.ts` referenced 13 names the
build does not emit (`--ds-font-sans`, `--ds-shadow-sm`, `--ds-motion-fast`,
`--ds-delta-neutral`, …) and nothing noticed until the test asked the build
what it actually contains.

**2. Colour groups are namespaced, never flattened.** `color.surface.*`,
`color.content.*`, `color.border.*`, `color.brand.*`. The first two drafts
flattened them, and the key names collide: `subtle` exists in both surface and
border, `inverse` existed in both content and border. In a flat object the
second declaration silently wins — `color.inverse` was returning
`--ds-border-inverse`, so every "inverse text colour" was a border colour. Not
one screenshot would show it.

**3. Interaction state lives in `styles.css`, not in inline styles.** React
accepts `':hover'` and `':focus-visible'` keys in a style object and the browser
ignores them completely; pseudo-classes are not expressible in a `style`
attribute. Every hover and focus state in the first draft was dead code that
read correctly. `styles.css` holds those states, and like everything else its
values are all `var(--ds-*)` — it adds *rules* to the system, never *values*.

## Verifying

```
pnpm --filter @funnelos/ui verify    # typecheck + test + prove
```

- `typecheck` — `tsc`, `strict` + `noUncheckedIndexedAccess`.
- `test` — 57 tests, jsdom + Testing Library.
- `prove` — adversarial self-test; see below.

## The gates are adversarial, not decorative

A gate that has never been shown to fail is an assumption, not a gate.
`prove-gates.mjs` mutates the source 11 different ways and asserts vitest
rejects each one, then asserts all 14 source files were restored byte-for-byte
and the suite is green again.

| | Mutation | Guarded property |
|---|---|---|
| A | a component references a token the build does not emit | A7 |
| B | a hard-coded `#7c3aed` appears in `Button` | A7 |
| C | a hard-coded `rgb()` appears in `Display` | A7 |
| D | `Field` stops wiring the error into `aria-describedby` | WCAG 3.3.1 |
| E | a solid `Button` reverts to `content-inverse` | the dark-mode 3.70:1 regression |
| F | `Button` loses its default `type="button"` | unintended form submit |
| G | `Field` disables the control when invalid | user cannot reach the error |
| H | `Dialog` stops restoring focus to the trigger | WCAG 2.4.3 |
| I | `Pagination` drops the page number from its accessible name | announced as bare "3" |
| J | `Pagination` stops setting `aria-current` | position not exposed |
| K | `Breadcrumbs` stops setting `aria-current` | current page not exposed |

Each trial must fail for the **named** reason. A trial that trips an unrelated
error proves nothing, and that has happened twice here:

- Trial H's first form deleted the code it was meant to break along with
  everything around it, so it "passed" on a `SyntaxError` while the focus path
  was never exercised.
- Trial J's first form anchored on `aria-current="page"`, which occurs **twice**
  in `Overlay.tsx`. `String.replace` fixes only the first match, so it mutated
  `Breadcrumbs` instead of `Pagination` — and the suite stayed green. That was a
  real finding twice over: a missing test for `Pagination`'s `aria-current`,
  and an ambiguous anchor that could hide future findings. `edit()` now refuses
  anchors that match more than once.

## What the tests actually found

Not a hypothetical list — each of these was a defect during the build:

- **`color.inverse` returned a border colour.** Duplicate object key across two
  flattened groups.
- **`allowedCustomProperties` threw on import.** It flattened one level, so
  `font.size` and `component.button.paddingX` arrived as objects. The A7 gate
  had been *compiled* but never *run*.
- **`Dialog` did not restore focus on close.** Radix's default restore left
  focus on `<body>` indefinitely, so a keyboard user who pressed Escape was
  dropped at the top of the document. The `Dialog` now tracks the last focused
  element with a `focusin` listener that is live only while closed, and restores
  it. Two other approaches were tried first and are both wrong for reasons
  documented at the call site: a commit-time `document.activeElement` snapshot
  misses a click (which focuses a button *without* rendering), and capturing on
  the render where `open` flips captures the dialog's own first control, because
  React runs child effects before parent effects.
- **13 of the token names I "knew" did not exist.** See rule 1.
- **`Pagination` announced ", go to page 3".** The comma was meant to join the
  visible digit, but the digit is `aria-hidden`, so the comma was announced as a
  leading comma in the button's name.

## Two things that look like bugs and are not

**`Dialog`'s content element does not receive focus on open.** Radix focuses the
first *tabbable* descendant — the Close button. The content carries
`tabindex="-1"` only so it *can* be focused programmatically. The test asserts
`dialog.contains(document.activeElement)`, which is the actual requirement; a
test asserting `toHaveFocus()` on the content node would be asserting a
behaviour Radix does not have.

**`RadioGroup` extracts a one-option `RadioItem` component.** `useId()` cannot
be called inside `.map()`. React tracks hooks by call order, not identity, so
adding or removing an option would silently reassign every subsequent id —
unlabelling the wrong radio.

## Load order

```ts
import '@funnelos/tokens/styles.css';   // defines the --ds-* variables
import '@funnelos/ui/styles.css';       // interaction states
```

## Still to do for §1.2

- [ ] The 13 remaining primitives.
- [ ] Storybook (`§1.7`) — there is no visual surface yet.
- [ ] `axe-core` in CI. Every property asserted here was hand-written; axe finds
      the ones nobody thought of.
- [ ] A keyboard walkthrough of each primitive. The tests assert individual
      properties; they do not assert that Tab order is *sensible* across a page.
- [ ] `forced-colors` / Windows High Contrast is stubbed in `styles.css` and
      has never been run in a real High Contrast session.
