import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Wraps a form or review that opens above a long table. It scrolls into view and takes focus when it
 * appears, so the click that opened it visibly does something.
 */
export function Panel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div ref={ref} tabIndex={-1} className="scroll-mt-4 outline-none">
      {children}
    </div>
  )
}
