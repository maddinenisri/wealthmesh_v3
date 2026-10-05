import { useEffect, useRef } from 'react'

/**
 * Brings focus back to the button that opened a panel once the panel closes (Cancel or Confirm), as the member
 * screens do. Call the returned function from the click that opens the panel, while the button still has focus.
 */
export function useReturnFocus(open: boolean): () => void {
  const trigger = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !open && trigger.current?.isConnected) trigger.current.focus()
    wasOpen.current = open
  }, [open])
  return () => {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
}
