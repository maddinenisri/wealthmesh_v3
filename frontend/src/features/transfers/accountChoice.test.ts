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

  it('V2_LOAN_001 never offer a loan for new money, even one that is kept: a loan takes a payment, not ordinary entries', () => {
    const all = [account('checking'), account('loan')]
    expect(usableAccounts(all).map((a) => a.type)).toEqual(['checking'])
    expect(usableAccounts(all, 'loanactive').map((a) => a.type)).not.toContain('loan')
  })

  it('V2_BROKERAGE_002 never offer a brokerage, even a draft or a kept one: it takes no ordinary money until purchases and funding exist', () => {
    const all = [account('checking'), account('brokerage'), account('brokerage', 'draft')]
    expect(usableAccounts(all).map((a) => a.type)).toEqual(['checking'])
    expect(usableAccounts(all, 'brokerageactive', 'brokeragedraft').map((a) => a.type)).toEqual([
      'checking',
    ])
  })
})
