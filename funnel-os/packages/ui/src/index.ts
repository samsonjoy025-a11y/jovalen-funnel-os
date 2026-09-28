/**
 * @funnelos/ui — the design system.
 *
 * Phase 1 §1.2 (primitives). The composites in §1.3 are not here yet: each one
 * encodes a specific PRD requirement, and the PRD is not in the repository.
 * Inventing `DataTable`'s permission-masking rules from the plan's paraphrase
 * would be worse than leaving it absent, because the shape would look
 * deliberate to the next reader.
 *
 * Import order matters for the consumer app:
 *
 *   import '@funnelos/tokens/tokens.css';   // the --ds-* variables
 *   import '@funnelos/ui/styles.css';       // interaction states
 *
 * The tokens subpath is `tokens.css`, not `styles.css`. Every other package
 * in this workspace exports its stylesheet as `./styles.css`, so the natural
 * guess is wrong here, and a wrong subpath is a resolution error at build
 * time rather than a silent visual one — which is the better of the two
 * failure modes, but still worth writing down.
 */

export * from './tokens.js';
export { cx, type ClassValue } from './cx.js';

export { Field, fieldControlStyle, fieldControlFocusStyle, zIndex, type FieldProps } from './primitives/Field.js';
export {
  Button,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './primitives/Button.js';
export { Input, Textarea, type InputProps } from './primitives/Input.js';
export {
  Checkbox,
  Switch,
  RadioGroup,
  Progress,
  type CheckboxProps,
  type ProgressProps,
  type RadioGroupProps,
  type RadioOption,
  type SwitchProps,
} from './primitives/Controls.js';
export {
  Alert,
  Avatar,
  Badge,
  Kbd,
  Skeleton,
  SkipLink,
  Spinner,
  StatusPill,
  VisuallyHidden,
  type AlertProps,
  type AvatarProps,
  type BadgeProps,
  type CardProps,
  type SkeletonProps,
  type Tone,
} from './primitives/Display.js';
export { Card } from './primitives/Display.js';
export {
  Breadcrumbs,
  Dialog,
  Pagination,
  SegmentedControl,
  Separator,
  Tabs,
  Tooltip,
  type Crumb,
  type DialogProps,
  type SegmentedOption,
  type TabDefinition,
} from './primitives/Overlay.js';
