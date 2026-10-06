import type { Account } from '../../api/accounts'
import { ACCOUNT_TYPES, accountTypeLabel } from '../accounts/accountTypes'

/** "Emergency Savings (Savings)": the type tells apart accounts that share a name. */
export const accountChoice = (account: Account): string =>
  `${account.name} (${accountTypeLabel(account.type)})`

/**
 * The accounts a chooser may offer for new money: a type the app can set up and an active status. An archived or
 * closed account leaves every chooser but keeps its history (slice 12). `keepIds` stay listed so an edit that already
 * points at one (a transfer's other side) still shows it. The server refuses the rest, too.
 */
export const usableAccounts = (accounts: Account[] | undefined, ...keepIds: string[]): Account[] =>
  (accounts ?? []).filter(
    (candidate) =>
      ACCOUNT_TYPES.some((type) => type.ready && type.value === candidate.type) &&
      (candidate.status === 'active' || keepIds.includes(candidate.id)),
  )
