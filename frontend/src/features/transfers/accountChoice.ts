import type { Account } from '../../api/accounts'
import { accountTypeLabel } from '../accounts/accountTypes'

/** "Emergency Savings (Savings)": the type tells apart accounts that share a name. */
export const accountChoice = (account: Account): string =>
  `${account.name} (${accountTypeLabel(account.type)})`
