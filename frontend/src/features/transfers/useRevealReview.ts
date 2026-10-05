import { useEffect } from 'react'

/**
 * A panel whose content swaps in place (form to review) must scroll to and focus the new content, not only on
 * mount: the heading with this id is brought into view and takes focus when the review appears.
 */
export function useRevealReview(inReview: boolean): void {
  useEffect(() => {
    if (!inReview) return
    const heading = document.getElementById('review-heading')
    heading?.scrollIntoView?.({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }, [inReview])
}
