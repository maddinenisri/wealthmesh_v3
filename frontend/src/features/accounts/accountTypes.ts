/**
 * Account types in their final order. `ready` types can be set up and hold money activity (the server's
 * `AccountType.holdsActivity`); the rest show as "coming soon" until their feature is built.
 */
export const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', ready: true },
  { value: 'savings', label: 'Savings', ready: true },
  { value: 'credit_card', label: 'Credit card', ready: false },
  { value: 'brokerage', label: 'Brokerage', ready: false },
  { value: 'loan', label: 'Loan', ready: false },
  { value: 'mortgage', label: 'Mortgage', ready: false },
] as const

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number]['value']

/** The name of a type for headings, for example "Savings". Unknown values are shown as they are. */
export function accountTypeLabel(value: string): string {
  return ACCOUNT_TYPES.find((type) => type.value === value)?.label ?? value
}
