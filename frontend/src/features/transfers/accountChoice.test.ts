import { describe, expect, it } from 'vitest'
import type { Account } from '../../api/accounts'
import { usableAccounts } from './accountChoice'

const account = (type: string, status = 'active'): Account => ({
  id: type + status,
  type,
  name: type,
  institution: null,
  ownerMemberIds: [],
  openedOn: '2026-09-01',
  openingAmount: '0.00',
  balance: { amount: '0.00', asOf: '2026-09-01' },
  status,
})

describe('account choosers', () => {
  it('V2_PROPERTY_002 never offer a property or other asset for new money, even one that is kept', () => {
    const all = [
      account('checking'),
      account('savings'),
      account('credit_card'),
      account('property'),
      account('other_asset'),
    ]
    expect(usableAccounts(all).map((a) => a.type)).toEqual(['checking', 'savings', 'credit_card'])
    expect(usableAccounts(all, 'propertyactive').map((a) => a.type)).not.toContain('property')
  })
})
