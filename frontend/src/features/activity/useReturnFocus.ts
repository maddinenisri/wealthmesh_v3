import { useEffect, useRef } from 'react'

/**
 * Brings focus back to the button that opened a panel once the panel closes (Cancel or Confirm), as the member
 * screens do. Call the returned function from the click that opens the panel, while the button still has focus.
 */
export function useReturnFocus(open: boolean): { (): void; cancel: () => void } {
  const trigger = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    // Focus returns without scrolling: a save scrolls to the new row itself, and the opener (often below a long
    // table) must not pull the page away from it.
    if (wasOpen.current && !open && trigger.current?.isConnected) {
      const opener = trigger.current
      opener.focus({ preventScroll: true })
      // An opener hard against the bottom edge (or off screen) is brought to the middle, so Cancel leaves it visible.
      const { top, bottom } = opener.getBoundingClientRect()
      if (top < 0 || bottom > window.innerHeight - 80) opener.scrollIntoView?.({ block: 'center' })
    }
    wasOpen.current = open
  }, [open])
  const remember = () => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  // A screen that moves focus itself after a save (to the row that changed) cancels the return to the opener.
  remember.cancel = () => {
    trigger.current = null
  }
  return remember
}
