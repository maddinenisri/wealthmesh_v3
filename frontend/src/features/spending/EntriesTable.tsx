import { useState } from 'react'
import { Amount, Button, Table, Td, Th } from '../../design-system'
import type { Activity } from '../../api/activity'
import { formatMoney } from '../../lib/money'
import { ownerNames } from '../accounts/ownerNames'
import { useAccountContext } from '../accounts/useAccountContext'
import { classText } from '../activity/classes'
import { PortionList } from '../activity/PortionList'

/** The words a table of entries uses (spending and income differ). */
export type EntryWords = { table: string; details: string; column: string; place: string }

/** The entries behind one category of a month, with the details of the one opened. */
export function Entries({
  entries,
  words,
  categoryId,
}: {
  entries: Activity[]
  words: EntryWords
  /** The category whose entries are listed: a split payment shows the part that is in it. */
  categoryId: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = entries.find((entry) => entry.id === openId)
  const { members } = useAccountContext()

  return (
    <div className="mt-4">
      <Table aria-label={words.table}>
        <thead>
          <tr>
            <Th>{words.column}</Th>
            <Th>Date</Th>
            <Th>{words.place}</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <Td>
                <Button variant="ghost" size="sm" onClick={() => setOpenId(entry.id)}>
                  {entry.kind === 'loan_payment'
                    ? `Interest on payment to ${entry.counterAccountName ?? 'a loan'}`
                    : (entry.description ??
                      (entry.portions.length > 0 ? 'Split expense' : entry.categoryName) ??
                      words.column)}
                </Button>
              </Td>
              <Td>{entry.occurredOn}</Td>
              <Td>{entry.accountName}</Td>
              <Td className="text-right">
                <Amount value={listedAmount(entry, categoryId)} />
                {entry.kind === 'loan_payment' ? (
                  <span className="block text-caption text-ink-muted">
                    Interest part of a payment
                  </span>
                ) : (
                  entry.portions.length > 0 && (
                    <span className="block text-caption text-ink-muted">
                      of {formatMoney(Number(entry.amount))} payment
                    </span>
                  )
                )}
                {entry.kind === 'refund' && (
                  <span className="block text-caption text-ink-muted">Refund</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      {open && (
        <dl aria-label={words.details} className="mt-3 grid max-w-md gap-4 sm:grid-cols-2">
          <Detail label="Account">{open.accountName}</Detail>
          <Detail label="Date">{open.occurredOn}</Detail>
          <Detail label="Amount">
            <Amount value={open.kind === 'refund' ? -Number(open.amount) : Number(open.amount)} />
            {open.kind === 'refund' && ' (refund)'}
          </Detail>
          {open.kind === 'loan_payment' && (
            <Detail label="Payment">Loan payment to {open.counterAccountName}</Detail>
          )}
          <Detail label="Category">
            {open.kind === 'loan_payment' ? (
              <>{open.portions[0]?.categoryName ?? 'Loan interest'}</>
            ) : open.portions.length > 0 ? (
              <>
                Split
                <PortionList portions={open.portions} />
              </>
            ) : (
              <>
                {open.categoryName ?? 'Uncategorized'}
                {open.categoryArchived && ' (archived)'}
              </>
            )}
          </Detail>
          {open.kind !== 'income' && open.portions.length === 0 && (
            <Detail label="Class">{classText(open.classification)}</Detail>
          )}
          <Detail label="Entered by">
            {open.enteredByMemberId ? ownerNames([open.enteredByMemberId], members) : ''}
          </Detail>
        </dl>
      )}
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** What an entry adds to the listed category: its portion there when split, else its amount (a refund lowers it). */
function listedAmount(entry: Activity, categoryId: string): number {
  if (entry.portions.length > 0)
    return entry.portions
      .filter((portion) => portion.categoryId === categoryId)
      .reduce((sum, portion) => sum + Number(portion.amount), 0)
  return entry.kind === 'refund' ? -Number(entry.amount) : Number(entry.amount)
}
