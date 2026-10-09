import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Wraps a form or review that opens above a long table. It scrolls into view and takes focus when it
 * appears, so the click that opened it visibly does something.
 */
export function Panel({
  children,
  takeFocus = true,
}: {
  children: ReactNode
  /** False when the caller puts focus on something inside (a form's heading after Back), so the panel does not take it. */
  takeFocus?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Not smooth: a swap of one panel for another shortens the page, and an animated scroll then stops short.
    ref.current?.scrollIntoView?.({ block: 'start' })
    if (takeFocus) ref.current?.focus({ preventScroll: true })
    // Mount only: a later change of `takeFocus` must not move focus again.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={ref} tabIndex={-1} className="scroll-mt-4 outline-none">
      {children}
    </div>
  )
}
