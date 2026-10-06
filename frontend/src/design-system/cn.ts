import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// `text-caption` is a font size from tokens.css. Without this, tailwind-merge reads it as a text colour and drops
// `text-on-primary` from a small primary Button (dark label on a dark button).
const merge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['caption'] }] } },
})

/** Joins class names and resolves conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs))
}
