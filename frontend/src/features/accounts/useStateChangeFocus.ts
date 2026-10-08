import { useEffect, useRef, useState } from 'react'
import { useReturnFocus } from '../activity/useReturnFocus'

/**
 * The one answer to "where does focus go when an account changes state" (slice 12). Archive, restore, close, reopen
 * and delete all use it, so no screen invents its own:
 *
 * - open the review from a button: call `begin()` in its click, so Cancel (or Back) returns focus to that button;
 * - arriving from a change made on another page: pass its text as `arrivedWith`;
 * - after Confirm: call `changed(text)`; the status line (`role="status"`, bound to `statusRef`) shows the text, comes
 *   into view and takes focus, because the opener has often gone (Archive turns into Restore) and the person came
 *   to see what changed.
 */
export function useStateChangeFocus(reviewOpen: boolean, arrivedWith?: string) {
  const returnFocus = useReturnFocus(reviewOpen)
  const [message, setMessage] = useState<string | null>(arrivedWith ?? null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  // A page reached by a change made elsewhere (a deleted account's page is gone) opens on its status line.
  useEffect(() => {
    if (!arrivedWith) return
    // The previous page's scroll position can carry over, so the line is brought into view before it takes focus.
    statusRef.current?.scrollIntoView?.({ block: 'nearest' })
    statusRef.current?.focus({ preventScroll: true })
  }, [arrivedWith])

  const begin = () => {
    setMessage(null)
    returnFocus()
  }

  /** Drops the arrival text when another card on the page starts its own review. */
  const clear = () => setMessage(null)

  const changed = (text: string) => {
    returnFocus.cancel()
    setMessage(text)
    requestAnimationFrame(() => {
      statusRef.current?.scrollIntoView?.({ block: 'nearest' })
      statusRef.current?.focus({ preventScroll: true })
    })
  }

  return { message, statusRef, begin, changed, clear }
}
