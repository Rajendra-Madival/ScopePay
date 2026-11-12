export function formatMoney(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatMoneyTotals(items: { amountCents: number; currency: string }[]) {
  const totals = new Map<string, number>()
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amountCents)
  }
  if (totals.size === 0) return formatMoney(0)
  return [...totals.entries()]
    .map(([currency, total]) => formatMoney(total, currency))
    .join(' · ')
}

export function formatDate(date: string) {
  if (!date) return 'Not scheduled'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}
