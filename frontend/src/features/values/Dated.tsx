import { stamp } from '../../lib/stamp'

/** A date that never breaks over two lines ("2026-09-" / "30"). */
export function Dated({ on }: { on: string }) {
  return <span className="whitespace-nowrap">{on}</span>
}

/** A saved-at time ("2026-09-30 10:05") that never breaks over two lines. */
export function Stamped({ at }: { at: string }) {
  return <span className="whitespace-nowrap">{stamp(at)}</span>
}
