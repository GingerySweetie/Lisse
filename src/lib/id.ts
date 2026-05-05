import { customAlphabet } from 'nanoid';

/** URL-safe-ish, no ambiguous chars; 14 chars ~ 80 bits of entropy. */
export const newId = customAlphabet(
  '23456789abcdefghijkmnpqrstuvwxyz',
  14,
);
