const pdfParse = require('pdf-parse')

export interface ParsedInvoice {
  invoice_number: string | null
  issue_date: string | null     // YYYY-MM-DD
  client_name: string | null    // proveedor emisor (gastos) o cliente (presupuestos/ingresos)
  client_cuit: string | null
  detail: string | null
  base_amount: number | null
  iva_rate: number | null       // ej: 0.21 = 21%
  iva_amount: number | null
  total_amount: number | null
  currency: 'ARS' | 'USD'
  exchange_rate: number | null
}

function emptyResult(): ParsedInvoice {
  return {
    invoice_number: null,
    issue_date: null,
    client_name: null,
    client_cuit: null,
    detail: null,
    base_amount: null,
    iva_rate: null,
    iva_amount: null,
    total_amount: null,
    currency: 'ARS',
    exchange_rate: null,
  }
}

// Parses AR-formatted numbers in whichever of the two common shapes appear in
// these PDFs: "4.392.000" (dot thousands, no decimals) or "1665000,00" (comma decimal, no thousands).
function parseNumAR(raw: string): number {
  const s = raw.trim()
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  if (s.includes('.')) {
    const parts = s.split('.')
    if (parts[parts.length - 1].length === 3) return parseFloat(s.replace(/\./g, '')) || 0
    return parseFloat(s) || 0
  }
  return parseFloat(s) || 0
}

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
}

function parseDateDMY(s: string): string {
  const [d, m, y] = s.split('/')
  return `${y}-${m}-${d}`
}

// "23 de junio de 2026" → "2026-06-23"
function parseSpanishLongDate(day: string, monthName: string, year: string): string | null {
  const month = SPANISH_MONTHS[monthName.toLowerCase()]
  if (!month) return null
  return `${year}-${month}-${day.padStart(2, '0')}`
}

// ── Formato 1: factura estándar ARCA (la que emiten los proveedores) ──
// Reconocible por "X FACTURA\nCOD. NN" y "Punto de Venta: ... Comp. Nro: ..."
function parseArcaFactura(fullText: string): ParsedInvoice {
  const result = emptyResult()

  // These PDFs repeat the same invoice 3x (ORIGINAL/DUPLICADO/TRIPLICADO) — keep only the
  // first copy so amount fields aren't summed multiple times.
  const text = fullText.split(/Pág\.\s*\d+\/\d+/)[0]

  // "FACTURA\nC\nCOD. 011" — the letter sits on its own line, after the word FACTURA
  const typeMatch = text.match(/FACTURA\s*\n([ABC])\s*\nCOD\.\s*(\d+)/)
  // "Punto de Venta:Comp. Nro:\n0000100000065" — labels and the 5+8 digit value are glued together
  const puntoVentaMatch = text.match(/Punto de Venta:\s*Comp\.\s*Nro:\s*\n?(\d{5})(\d{8})/)
  if (typeMatch && puntoVentaMatch) {
    result.invoice_number = `${typeMatch[1]} ${puntoVentaMatch[1]}-${puntoVentaMatch[2]}`
  } else if (puntoVentaMatch) {
    result.invoice_number = `${puntoVentaMatch[1]}-${puntoVentaMatch[2]}`
  }

  // The 3 period dates run together with no separators, followed by the issue date and the
  // provider's CUIT each on their own line: "24/06/202624/06/202624/06/2026\n24/06/2026\n27960260185"
  const datesMatch = text.match(/(?:\d{2}\/\d{2}\/\d{4}){3}\n(\d{2}\/\d{2}\/\d{4})\n(\d{11})/)
  if (datesMatch) {
    result.issue_date = parseDateDMY(datesMatch[1])
    result.client_cuit = datesMatch[2]
  }

  // Provider (emisor) name appears right after the ORIGINAL/DUPLICADO/TRIPLICADO stamp
  const nameMatch = text.match(/(?:ORIGINAL|DUPLICADO|TRIPLICADO)\n(.+)\n/)
  if (nameMatch) result.client_name = nameMatch[1].trim()

  // Currency & exchange rate (USD invoices carry an ARS-equivalent note)
  result.currency = /\(USD\)|Dólar Estadounidense/i.test(text) ? 'USD' : 'ARS'
  const exchangeMatch = text.match(/tipo de cambio\s*consignado de\s*([\d.]+)/i)
  if (exchangeMatch) result.exchange_rate = parseFloat(exchangeMatch[1])

  // Detail: product/service description sits between the item code (a short standalone
  // number) and the quantity marker, e.g. "\n10\nServicio Pizza Party...\n90,00\nunidades"
  const detailMatch = text.match(/\n\d{1,3}\n([\s\S]+?)\n\d+,\d+\nunidades/)
  if (detailMatch) result.detail = detailMatch[1].replace(/\n/g, ' ').trim()

  // IVA breakdown (Factura A/B) — sum every non-zero "IVA N%:" line
  const ivaMatches = [...text.matchAll(/IVA\s*(\d+(?:\.\d+)?)\s*%:\s*(?:\$|USD)?\s*([\d.,]+)/gi)]
  let ivaTotal = 0
  let ivaRate: number | null = null
  for (const m of ivaMatches) {
    const amount = parseNumAR(m[2])
    if (amount > 0) {
      ivaTotal += amount
      if (ivaRate === null) ivaRate = parseFloat(m[1]) / 100
    }
  }

  const netoMatch = text.match(/Importe Neto Gravado:\s*(?:\$|USD)?\s*([\d.,]+)/i)
  // Factura A/B: has an inline "Importe Total:" value. Factura C (monotributo) does not —
  // its footer values appear scrambled ahead of their labels, so fall back to the value
  // immediately preceding "Subtotal: $" (empirically always the correct total in that case).
  const totalInlineMatch = text.match(/Importe Total:\s*(?:\$|USD)?\s*([\d.,]+)/i)
  const totalFallbackMatch = text.match(/([\d.,]+)\s*\nSubtotal:\s*\$/)

  if (totalInlineMatch) {
    result.total_amount = parseNumAR(totalInlineMatch[1])
  } else if (totalFallbackMatch) {
    result.total_amount = parseNumAR(totalFallbackMatch[1])
  }

  if (netoMatch) {
    result.base_amount = parseNumAR(netoMatch[1])
    result.iva_amount = ivaTotal
    result.iva_rate = ivaRate
  } else if (result.total_amount != null) {
    // No IVA breakdown found (Factura C) — neto equals total, no tax
    result.base_amount = result.total_amount
    result.iva_amount = 0
    result.iva_rate = 0
  }

  return result
}

// ── Formato 2: presupuesto de texto libre (cotización a un cliente) ──
// Reconocible por la palabra "presupuesto" sin la estructura de factura ARCA.
function parsePresupuesto(text: string): ParsedInvoice {
  const result = emptyResult()

  const longDateMatch = text.match(/(\d{1,2}) de ([a-záéíóú]+) de (\d{4})/i)
  if (longDateMatch) {
    result.issue_date = parseSpanishLongDate(longDateMatch[1], longDateMatch[2], longDateMatch[3])
  }

  const clientMatch = text.match(/CLIENTE\s*:\s*([^\n]+)/i)
  if (clientMatch) result.client_name = clientMatch[1].trim()

  const espacioMatch = text.match(/ESPACIO\s*:\s*([^\n]+)/i)
  if (espacioMatch) result.detail = espacioMatch[1].trim()

  const costMatch = text.match(/costo de\s*:?\s*\$\s*([\d.,]+)/i)
  if (costMatch) {
    const total = parseNumAR(costMatch[1])
    result.total_amount = total
    result.base_amount = total
    result.iva_amount = 0
    result.iva_rate = 0
  }

  return result
}

// ── Formato 3 (legacy): facturas propias de ACO a sus inquilinos (aco-admin) ──
// Reconocible por "Sr. (es):" y la dirección fija de ACO ("1135 CABA.").
function parseAcoAdminFactura(text: string): ParsedInvoice {
  const result = emptyResult()

  const numDateMatch = text.match(/([A-Z]-\d+-\d+)\n(\d{2}\/\d{2}\/\d{4})/)
  if (numDateMatch) {
    result.invoice_number = numDateMatch[1]
    result.issue_date = parseDateDMY(numDateMatch[2])
  }

  const clientNameMatch = text.match(/Sr\.\s*\(es\):\s*(.+)/)
  if (clientNameMatch) result.client_name = clientNameMatch[1].trim()

  const clientCuitMatch = text.match(/CUIT:\s*([\d-]+)\nCond\. IVA/)
  if (clientCuitMatch) result.client_cuit = clientCuitMatch[1].trim()

  result.currency = text.includes('Dólares') ? 'USD' : 'ARS'

  const cotMatch = text.match(/Cotizaci[oó]n:\s*([\d.]+)/)
  if (cotMatch) result.exchange_rate = parseFloat(cotMatch[1])

  const detailMatch = text.match(/1135 CABA\.\n([\s\S]+?) 1\.00 /)
  if (detailMatch) result.detail = detailMatch[1].replace(/\n/g, ' ').trim()

  let brutoText: string | null = null
  const bruto1 = text.match(/([\d,]+\.?\d*)\n\n-- 1 of 1 --/)
  if (bruto1) brutoText = bruto1[1]
  if (!brutoText) {
    const bruto2 = text.match(/P[aá]gina\s+1\s*\n([\d,]+\.?\d*)/)
    if (bruto2) brutoText = bruto2[1]
  }
  if (!brutoText) {
    const bruto3 = text.trimEnd().match(/([\d,]+\.\d{2})\s*$/)
    if (bruto3) brutoText = bruto3[1]
  }
  if (brutoText) result.base_amount = parseFloat(brutoText.replace(/,/g, ''))

  const impuestosMatch = text.match(/Impuestos:\s*([\d,]+\.?\d*)/)
  if (impuestosMatch && result.base_amount && result.base_amount > 0) {
    const impuestos = parseFloat(impuestosMatch[1].replace(/,/g, ''))
    result.iva_amount = impuestos
    result.iva_rate = Math.round(impuestos / result.base_amount * 10000) / 10000
  } else {
    const ivaRates: [string, number][] = [
      ['2\\.5', 0.025], ['5', 0.05], ['10\\.5', 0.105], ['21', 0.21], ['27', 0.27],
    ]
    for (const [label, rate] of ivaRates) {
      const m = text.match(new RegExp(`IVA ${label}:\\s*([\\d,]+\\.?\\d*)`))
      if (m && parseFloat(m[1].replace(/,/g, '')) > 0) {
        result.iva_rate = rate
        result.iva_amount = parseFloat(m[1].replace(/,/g, ''))
        break
      }
    }
  }

  const totalMatch = text.match(/Total:\s*(?:US\$|\$)?\s*([\d,]+\.?\d*)/)
  if (totalMatch) result.total_amount = parseFloat(totalMatch[1].replace(/,/g, ''))

  return result
}

export async function parseInvoicePdf(buffer: Buffer): Promise<ParsedInvoice> {
  const { text } = await pdfParse(buffer)

  const isArcaFactura = /FACTURA\s*\n[ABC]\s*\nCOD\.\s*\d+/.test(text) || /Punto de Venta:\s*Comp\.\s*Nro/.test(text)
  if (isArcaFactura) return parseArcaFactura(text)

  if (/presupuesto/i.test(text)) return parsePresupuesto(text)

  return parseAcoAdminFactura(text)
}
