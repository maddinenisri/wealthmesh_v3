import { useEffect, useRef, type ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  description?: string
  /** Page-level actions, such as a primary button. */
  actions?: ReactNode
  /** Takes focus when the page opens, for a page that is returned to (Cancel on an Edit page). */
  focusTitle?: boolean
}

/** Title block for the top of a page: one h1, optional supporting text and actions. */
export function PageHeader({ title, description, actions, focusTitle }: PageHeaderProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusTitle) heading.current?.focus()
  }, [focusTitle])
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1
          ref={heading}
          tabIndex={focusTitle ? -1 : undefined}
          className="font-display text-3xl font-medium outline-none"
        >
          {title}
        </h1>
        {description && <p className="mt-2 max-w-prose text-ink-muted">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
