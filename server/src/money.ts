/**
 * money.ts — the stake limits and money formatting the server needs at
 * runtime.
 *
 * Copied from the app's src/types, because Railway builds only this folder.
 * test/money.test.ts fails if the two ever drift. (Type-only imports from
 * src/types are fine: they're erased at build time.)
 */

export const MIN_STAKE_CENTS = 100;
export const MAX_STAKE_CENTS = 2000;

export function formatMoney(cents: number, showCents = true): string {
  const dollars = cents / 100;
  return showCents || cents % 100 !== 0
    ? `$${dollars.toFixed(2)}`
    : `$${dollars.toFixed(0)}`;
}
