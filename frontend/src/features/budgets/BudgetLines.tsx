import { useState } from 'react'
import { UNCATEGORIZED } from '../../api/activity'
import type { BudgetLine } from '../../api/budgets'
import { Amount, Button, Table, Td, Th } from '../../design-system'
import { useSpendingEntries } from '../../hooks/useActivity'
import { Entries } from '../spending/EntriesTable'
import { lineStatus, percentText } from './budgetText'

const WORDS = {
  table: 'Expenses behind this Budget line',
  details: 'Budget expense details',
  column: 'Expense',
  place: 'Paid from',
}

/**
 * One row per category: target, spending, status and the share of the target used. With `month` the category name
 * opens the expenses behind its spending (the Spending page's own read); a review shows the table without that.
 */
export function BudgetLines({ lines, month }: { lines: BudgetLine[]; month?: string }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="mt-3">
      <Table aria-label="Budget by category">
        <thead>
          <tr>
            <Th>Category</Th>
            <Th className="text-right">Target</Th>
            <Th className="text-right">Spending</Th>
            <Th>Status</Th>
            <Th className="hidden sm:table-cell">Used</Th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const id = line.categoryId ?? UNCATEGORIZED
            return (
              <tr key={id}>
                <Td>
                  {month ? (
                    <Button
                      variant={id === openId ? 'primary' : 'ghost'}
                      size="sm"
                      aria-pressed={id === openId}
                      onClick={() => setOpenId(id === openId ? null : id)}
                    >
                      {line.name}
                      {line.archived && ' (archived)'}
                    </Button>
                  ) : (
                    <>
                      {line.name}
                      {line.archived && ' (archived)'}
                    </>
                  )}
                </Td>
                <Td className="text-right">
                  {line.target === null ? '—' : <Amount value={Number(line.target)} />}
                </Td>
                <Td className="text-right">
                  <Amount value={Number(line.spending)} />
                </Td>
                <Td>
                  {lineStatus(line)}
                  <span className="block text-caption text-ink-muted sm:hidden">
                    Used: {percentText(line)}
                  </span>
                </Td>
                <Td className="hidden sm:table-cell">{percentText(line)}</Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      {month && openId && <CategoryEntries month={month} categoryId={openId} />}
    </div>
  )
}

function CategoryEntries({ month, categoryId }: { month: string; categoryId: string }) {
  const entries = useSpendingEntries(month, categoryId, null)
  if (!entries.data) return null
  if (entries.data.length === 0) return <p className="mt-3 text-sm">No recorded expenses.</p>
  return <Entries entries={entries.data} words={WORDS} categoryId={categoryId} />
}
