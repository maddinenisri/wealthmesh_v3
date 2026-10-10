// A short unique suffix for account names, symbols and labels in specs that share one database (pitfalls 42 to 45:
// a short label or a reused symbol collided with another spec's rows). Letters only, so it is safe in a symbol.
let counter = 0

export function uniq(prefix: string): string {
  counter += 1
  const stamp = (Date.now() % 1_000_000).toString(36).replace(/\d/g, (d) => 'abcdefghij'[Number(d)])
  return `${prefix}${stamp}${String.fromCharCode(97 + (counter % 26))}`
}
