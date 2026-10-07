import type { Account } from '../../api/accounts'
import { ACCOUNT_TYPES, accountTypeLabel, typeTraits } from '../accounts/accountTypes'
import { STATUS_LABEL } from '../accounts/statusLabel'

/** "Emergency Savings (Savings)": the type tells apart accounts that share a name; a status other than active is said. */
export const accountChoice = (account: Account): string =>
  `${account.name} (${accountTypeLabel(account.type)})${
    account.status === 'active' ? '' : ` · ${STATUS_LABEL[account.status] ?? account.status}`
  }`

/**
 * The accounts a chooser may offer for new money: a type the app can set up that holds money activity (not a
 * property, other asset, loan or investment account) and an active status. An archived or
 * closed account leaves every chooser but keeps its history (slice 12). `keepIds` stay listed so an edit that already
 * points at one (a transfer's other side) still shows it. The server refuses the rest, too.
 */
export const usableAccounts = (accounts: Account[] | undefined, ...keepIds: string[]): Account[] =>
  (accounts ?? []).filter(
    (candidate) =>
      ACCOUNT_TYPES.some((type) => type.ready && type.value === candidate.type) &&
      typeTraits(candidate.type).holdsMoney &&
      (candidate.status === 'active' || keepIds.includes(candidate.id)),
  )
