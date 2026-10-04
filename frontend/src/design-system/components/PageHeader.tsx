import type { ReactNode } from 'react'

export type PageHeaderProps = {
  title: string
  description?: string
  /** Page-level actions, such as a primary button. */
  actions?: ReactNode
}

/** Title block for the top of a page: one h1, optional supporting text and actions. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-medium">{title}</h1>
        {description && <p className="mt-2 max-w-prose text-ink-muted">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
