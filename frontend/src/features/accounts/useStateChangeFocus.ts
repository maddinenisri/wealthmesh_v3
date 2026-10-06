import { useRef, useState } from 'react'
import { useReturnFocus } from '../activity/useReturnFocus'

/**
 * The one answer to "where does focus go when an account changes state" (slice 12). Archive, restore, close, reopen
 * and delete all use it, so no screen invents its own:
 *
 * - open the review from a button: call `begin()` in its click, so Cancel (or Back) returns focus to that button;
 * - after Confirm: call `changed(text)`; the status line (`role="status"`, bound to `statusRef`) shows the text, comes
 *   into view and takes focus, because the opener has often gone (Archive turns into Restore) and the person came
 *   to see what changed.
 */
export function useStateChangeFocus(reviewOpen: boolean) {
  const returnFocus = useReturnFocus(reviewOpen)
  const [message, setMessage] = useState<string | null>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)

  const begin = () => {
    setMessage(null)
    returnFocus()
  }

  const changed = (text: string) => {
    returnFocus.cancel()
    setMessage(text)
    requestAnimationFrame(() => {
      statusRef.current?.scrollIntoView?.({ block: 'nearest' })
      statusRef.current?.focus({ preventScroll: true })
    })
  }

  return { message, statusRef, begin, changed }
}
