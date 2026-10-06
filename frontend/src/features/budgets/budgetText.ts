import type { Budget, BudgetLine } from '../../api/budgets'
import { MONTH_NAMES } from '../../lib/months'
import { formatMoney } from '../../lib/money'

const money = (value: string) => formatMoney(Number(value))

/** "September" or "September 2026" from "2026-09". */
export function monthLabel(month: string, withYear = false): string {
  const [year, number] = month.split('-').map(Number)
  return withYear ? `${MONTH_NAMES[number - 1]} ${year}` : MONTH_NAMES[number - 1]
}

/** The month against its total Budget: "$60.00 over Budget". */
export function monthStatus(budget: Pick<Budget, 'state' | 'difference'>): string {
  if (budget.state === 'over') return `${money(budget.difference ?? '0')} over Budget`
  if (budget.state === 'under') return `${money(budget.difference ?? '0')} under Budget`
  return 'On Budget'
}

/** A category against its target: "$30.00 over target", "No target set", "$50.00 unplanned spending". */
export function lineStatus(line: BudgetLine): string {
  switch (line.state) {
    case 'over':
      return `${money(line.difference)} over target`
    case 'left':
      return `${money(line.difference)} left to target`
    case 'on':
      return 'On target'
    case 'none':
      return 'No target set'
    case 'unplanned':
      return `${money(line.difference)} unplanned spending`
    case 'noSpending':
      return 'No spending'
  }
}

/** Percent of the target used; a zero target has none, and says why. */
export function percentText(line: BudgetLine): string {
  if (line.target === null) return 'No target'
  return line.percentUsed === null ? 'Not applicable' : `${line.percentUsed}%`
}

/** What the total Budget and the category targets say about each other (BUDGET_002, 003). */
export function gapText(unallocated: string): string {
  const gap = Number(unallocated)
  if (gap > 0) return `${formatMoney(gap)} of the total Budget has no category target.`
  if (gap < 0) return `Category targets are ${formatMoney(-gap)} more than the total Budget.`
  return 'Category targets and the total Budget agree.'
}
