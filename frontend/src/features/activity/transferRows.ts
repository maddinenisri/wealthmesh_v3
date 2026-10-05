import type { Activity } from '../../api/activity'

export const isTransfer = (entry: { kind: string }): boolean =>
  entry.kind === 'transfer_out' || entry.kind === 'transfer_in'

/** What a row's buttons name: a transfer is named by the account on the other side. */
export function rowName(entry: Activity): string {
  return isTransfer(entry)
    ? `transfer ${entry.kind === 'transfer_out' ? 'to' : 'from'} ${entry.counterAccountName ?? 'account'}`
    : (entry.description ?? entry.categoryName ?? 'entry')
}
