/**
 * cx — className joiner.
 *
 * Exists so a component can merge its own classes with a caller's without every
 * call site growing an `Array.isArray(a) ? a.join(' ') : a` ternary, and
 * without falsy values producing the string "false" or "undefined" in the
 * class attribute. A stray "undefined" in className is valid HTML and looks
 * fine in review.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string | undefined {
  const out = values.filter((v): v is string => typeof v === 'string' && v.length > 0);
  return out.length > 0 ? out.join(' ') : undefined;
}
