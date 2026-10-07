import type { ReactNode } from 'react'
import type { OpeningPreview } from '../../api/investments'
import { Button, FormAlert } from '../../design-system'
import { formatMoney } from '../../lib/money'

const dollars = (text: string) => formatMoney(Number(text))

/** The holding lines of an opening: what each is worth, by quantity times price. */
export function HoldingTable({ lines }: { lines: OpeningPreview['holdings'] }) {
  if (lines.length === 0) return null
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Opening holdings</caption>
        <thead>
          <tr className="text-left text-caption text-ink-muted">
            <th className="pr-3 font-normal">Holding</th>
            <th className="pr-3 text-right font-normal">Quantity</th>
            <th className="pr-3 text-right font-normal">Market price</th>
            <th className="pr-3 text-right font-normal">Value</th>
            <th className="font-normal">Price date</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.symbol}-${index}`}>
              <td className="pr-3">{line.symbol}</td>
              <td className="pr-3 text-right normal-nums">{line.quantity}</td>
              <td className="pr-3 text-right normal-nums">{dollars(line.price)}</td>
              <td className="pr-3 text-right normal-nums">{dollars(line.value)}</td>
              <td className="whitespace-nowrap">{line.valueOn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The review of an investment opening before it is saved (V2_*_002, 006): what the account will start at, the cash and
 * holdings it is made of, and, when a typed total does not match, the mismatch. Nothing is saved until Confirm, and
 * a mismatch cannot be confirmed (the server refuses it too).
 */
export function OpeningReview({
  heading,
  name,
  openedOn,
  preview,
  blank,
  details,
  error,
  pending,
  confirmLabel = 'Confirm',
  onConfirm,
  onBack,
  cancel,
}: {
  heading: string
  name: string
  openedOn: string
  preview: OpeningPreview
  /** The starting amount was left blank and no holdings were entered. */
  blank: boolean
  details: ReactNode
  error?: string
  pending: boolean
  confirmLabel?: string
  onConfirm: () => void
  onBack: () => void
  cancel: ReactNode
}) {
  const mismatch = preview.state === 'mismatch'
  const draft = preview.state === 'draft'
  return (
    <section aria-labelledby="setup-review-heading" className="flex max-w-xl flex-col gap-3">
      <h2 id="setup-review-heading" tabIndex={-1} className="text-lg font-semibold outline-none">
        {heading}
      </h2>
      <FormAlert message={error} />
      {mismatch ? (
        <>
          <p role="alert" className="rounded-control border border-negative p-3 text-sm">
            {preview.message}
          </p>
          <p>
            Calculated Balance{' '}
            <span className="whitespace-nowrap">{dollars(preview.calculatedBalance ?? '0')}</span>{' '}
            (cash plus holdings) against the opening total{' '}
            <span className="whitespace-nowrap">{dollars(preview.openingTotal ?? '0')}</span>. The
            difference is {dollars(preview.difference ?? '0')}.
          </p>
        </>
      ) : draft ? (
        <p>
          {name} will be saved as a draft. Cash has not been answered, and it is not worked out from
          the total. It adds nothing to household wealth until setup is finished.
        </p>
      ) : (
        <p>
          {name} will start at{' '}
          <span className="whitespace-nowrap">{dollars(preview.calculatedBalance ?? '0')}</span> on{' '}
          <span className="whitespace-nowrap">{openedOn}</span>.
        </p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-ink-muted">Cash</dt>
        <dd className="normal-nums">
          {preview.cash === null ? 'Not answered yet' : dollars(preview.cash)}
        </dd>
        <dt className="text-ink-muted">Holdings</dt>
        <dd className="normal-nums">
          {preview.holdings.length === 0
            ? 'None recorded'
            : `${dollars(preview.holdingsValue)} in ${preview.holdings.length} ${
                preview.holdings.length === 1 ? 'holding' : 'holdings'
              }`}
        </dd>
        {preview.openingTotal !== null && (
          <>
            <dt className="text-ink-muted">Opening total</dt>
            <dd className="normal-nums">{dollars(preview.openingTotal)}</dd>
          </>
        )}
      </dl>
      <HoldingTable lines={preview.holdings} />
      {!mismatch && !draft && preview.openingTotal !== null && (
        <p className="text-sm text-ink-muted">
          Cash plus holdings equals the opening total, with no unexplained amount.
        </p>
      )}
      {!mismatch && !draft && blank && (
        <p className="text-sm text-ink-muted">
          The starting amount was left blank, so cash starts at $0.00 and no holdings are recorded.
          Saving completes the setup.
        </p>
      )}
      <p className="text-sm text-ink-muted">{details}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending || !preview.canSave} onClick={onConfirm}>
          {pending ? 'Saving' : confirmLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        {cancel}
      </div>
    </section>
  )
}
