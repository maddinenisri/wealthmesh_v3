import { useState } from 'react'
import type { Account } from '../../api/accounts'
import type { Activity } from '../../api/activity'
import type { Member } from '../../api/household'
import { BalanceCorrection } from './BalanceCorrection'
import { isDebt } from '../accounts/accountTypes'
import { isCard } from '../accounts/cardBalance'
import { StartingBalanceCorrection } from './StartingBalanceCorrection'

/**
 * Update balance: either say what the Balance was on a date, or correct the starting balance. Editing an earlier
 * correction skips the choice. Neither is ever income or spending.
 */
export function UpdateBalance({
  account,
  members,
  today,
  editing,
  onDone,
}: {
  account: Account
  members: Member[]
  today: string
  editing?: Activity
  onDone: () => void
}) {
  const [mode, setMode] = useState<'date' | 'starting'>('date')
  const [locked, setLocked] = useState(false)
  const [carried, setCarried] = useState<{ amount: string; on: string } | undefined>()
  return (
    <>
      {!editing && !isCard(account.type) && (
        <fieldset className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <legend className="sr-only">What do you want to update?</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="update-mode"
              disabled={locked}
              checked={mode === 'date'}
              onChange={() => setMode('date')}
            />
            {isDebt(account.type)
              ? 'Update the balance owed on a date'
              : 'Update the Balance on a date'}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="update-mode"
              disabled={locked}
              checked={mode === 'starting'}
              onChange={() => setMode('starting')}
            />
            {isDebt(account.type)
              ? 'Correct the initial amount owed'
              : 'Correct the starting balance'}
          </label>
        </fieldset>
      )}
      {mode === 'starting' && !editing ? (
        <StartingBalanceCorrection
          key={carried ? `${carried.on}-${carried.amount}` : 'blank'}
          account={account}
          members={members}
          today={today}
          initial={carried}
          onReviewing={setLocked}
          onDone={onDone}
        />
      ) : (
        <BalanceCorrection
          account={account}
          members={members}
          today={today}
          editing={editing}
          onReviewing={setLocked}
          onBeforeStart={
            editing || isCard(account.type)
              ? undefined
              : (draft) => {
                  setCarried(draft)
                  setMode('starting')
                }
          }
          onDone={onDone}
        />
      )}
    </>
  )
}
