export function formatARS(value: number | null | undefined) {
  const n = value ?? 0
  return `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatUSD(value: number | null | undefined) {
  const n = value ?? 0
  return `US$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function toUsd(ars: number, exchangeRate: number | null | undefined) {
  if (!exchangeRate) return null
  return ars / exchangeRate
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.split('-')
  return `${d}-${m}-${y}`
}
