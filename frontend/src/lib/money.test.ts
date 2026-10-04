import { describe, expect, it } from 'vitest'
import { parseAmount } from './money'

describe('parseAmount', () => {
  it.each([
    ['5000', '5000.00'],
    ['$5,000.00', '5000.00'],
    [' 5,000.5 ', '5000.50'],
    ['0', '0.00'],
    ['$0.00', '0.00'],
    ['-$12.30', '-12.30'],
  ])('reads %s as %s', (text, expected) => {
    expect(parseAmount(text)).toBe(expected)
  })

  it.each(['', 'five thousand', '1.234', '1,00', '1e3', '$', '5000.', '--5', '5 000'])(
    'refuses %j',
    (text) => {
      expect(parseAmount(text)).toBeNull()
    },
  )
})
