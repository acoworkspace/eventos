// U+00A0 (non-breaking space) keeps the symbol glued to the number in narrow table cells
export function formatARS(value: number | null | undefined) {
  const n = Math.round(value ?? 0)
  return `$ ${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
}

export function formatUSD(value: number | null | undefined) {
  const n = Math.round(value ?? 0)
  return `USD ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
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
