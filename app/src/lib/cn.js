import { clsx } from 'clsx';

/**
 * Tiny conditional-classname helper for pure-Tailwind components.
 * (No tailwind-merge — we keep utility lists non-conflicting by convention.)
 *
 * @param {...import('clsx').ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
  return clsx(inputs);
}
