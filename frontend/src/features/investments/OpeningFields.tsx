import { useFieldArray, type Control, type UseFormSetFocus } from 'react-hook-form'
import { Button, TextField } from '../../design-system'
import {
  blankHolding,
  cashRules,
  holdingRules,
  totalRules,
  type OpeningValues,
} from './openingForm'

const MAX_HOLDINGS = 100

/**
 * The opening components of an investment account: an optional typed total (a check, never the Balance), the cash,
 * and the holding lines. Used by the setup form and by Finish setup, so both read the same words.
 */
export function OpeningFields({
  control,
  setFocus,
  setupOn,
  today,
  finishing = false,
}: {
  control: Control<OpeningValues>
  setFocus: UseFormSetFocus<OpeningValues>
  /** The setup date now typed (or fixed, for a draft): a holding's value date may not be earlier. */
  setupOn: () => string
  today: string
  /** Finishing a draft: a blank cash keeps it a draft, so the hint says that instead. */
  finishing?: boolean
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'holdings' })

  return (
    <>
      <TextField
        control={control}
        name="total"
        label="Opening total"
        inputMode="decimal"
        placeholder="0.00"
        hint="Optional. It is checked against cash plus holdings and is never used as the Balance."
        rules={totalRules}
      />
      <TextField
        control={control}
        name="cash"
        label="Cash"
        inputMode="decimal"
        placeholder="0.00"
        hint={
          finishing
            ? 'Answer the cash to finish. A blank cash keeps this a draft.'
            : 'Leave everything blank to start at $0.00. If you enter a total or holdings, answer the cash too, or the account stays a draft.'
        }
        rules={cashRules}
      />
      <section aria-labelledby="holdings-heading" className="flex flex-col gap-3">
        <h3 id="holdings-heading" className="text-sm font-medium">
          Holdings
        </h3>
        {fields.length === 0 && (
          <p className="text-caption text-ink-muted">
            Optional. Add the shares held on the setup date.
          </p>
        )}
        {fields.map((field, index) => {
          const n = index + 1
          const rules = holdingRules(setupOn, today, index)
          return (
            <fieldset
              key={field.id}
              className="grid gap-3 rounded-control border border-line p-3 sm:grid-cols-2"
            >
              <legend className="px-1 text-sm font-medium">Holding {n}</legend>
              <TextField
                control={control}
                name={`holdings.${index}.symbol`}
                label={`Holding ${n} name or symbol`}
                rules={rules.symbol}
              />
              <TextField
                control={control}
                name={`holdings.${index}.quantity`}
                label={`Holding ${n} quantity`}
                inputMode="decimal"
                placeholder="0"
                rules={rules.quantity}
              />
              <TextField
                control={control}
                name={`holdings.${index}.price`}
                label={`Holding ${n} market price`}
                inputMode="decimal"
                placeholder="0.00"
                rules={rules.price}
              />
              <TextField
                control={control}
                name={`holdings.${index}.valueOn`}
                label={`Holding ${n} value date`}
                type="date"
                rules={rules.valueOn}
              />
              <div className="sm:col-span-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    remove(index)
                    // The button is gone: focus goes to the holding that took its place, or the one before, or
                    // the button that adds one when none is left.
                    requestAnimationFrame(() => {
                      const next = Math.min(index, fields.length - 2)
                      if (next >= 0) setFocus(`holdings.${next}.symbol`)
                      else document.getElementById('add-holding')?.focus()
                    })
                  }}
                >
                  Remove holding {n}
                </Button>
              </div>
            </fieldset>
          )
        })}
        <div>
          <Button
            id="add-holding"
            variant="secondary"
            size="sm"
            disabled={fields.length >= MAX_HOLDINGS}
            onClick={() => {
              append(blankHolding(setupOn()))
              requestAnimationFrame(() => setFocus(`holdings.${fields.length}.symbol`))
            }}
          >
            Add a holding
          </Button>
        </div>
      </section>
    </>
  )
}
