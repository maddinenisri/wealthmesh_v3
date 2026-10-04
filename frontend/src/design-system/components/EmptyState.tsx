import type { ReactNode } from 'react'

export type EmptyStateProps = {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-surface border border-dashed border-line p-6">
      <h3 className="font-display text-lg font-medium">{title}</h3>
      <p className="max-w-prose text-sm text-ink-muted">{description}</p>
      {action}
    </div>
  )
}
