import { describe, expect, it } from 'vitest'
import { buttonStyles } from './components/buttonStyles'
import { cn } from './cn'

describe('cn', () => {
  it('keeps the label colour of a small primary button (text-caption is a size, not a colour)', () => {
    const classes = cn(buttonStyles({ variant: 'primary', size: 'sm' }))
    expect(classes).toContain('text-on-primary')
    expect(classes).toContain('text-caption')
  })

  it('still lets a later colour replace an earlier one', () => {
    expect(cn('text-ink', 'text-negative')).toBe('text-negative')
  })
})
