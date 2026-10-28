export function money(n: number, cents = true): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  })
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}
