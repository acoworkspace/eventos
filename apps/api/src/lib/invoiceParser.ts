const pdfParse = require('pdf-parse')

export interface ParsedInvoice {
  invoice_number: string | null
  issue_date: string | null     // YYYY-MM-DD
  client_name: string | null
  client_cuit: string | null
  detail: string | null
  base_amount: number | null
  iva_rate: number | null       // alícuota total (IVA + IIBB), e.g. 0.255
  iva_amount: number | null     // monto total de impuestos (Impuestos: campo)
  total_amount: number | null
  currency: 'ARS' | 'USD'
  exchange_rate: number | null
}

// "10,800.00" → 10800  |  "2,754.00" → 2754
function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

// "01/05/2026" → "2026-05-01"
function parseDate(s: string): string {
  const [d, m, y] = s.split('/')
  return `${y}-${m}-${d}`
}

// Ported from acoworkspace/aco-admin apps/api/src/lib/invoiceParser.ts —
// regex parser tuned to the fixed AFIP invoice layout ACO always issues.
export async function parseInvoicePdf(buffer: Buffer): Promise<ParsedInvoice> {
  const { text } = await pdfParse(buffer)

  const result: ParsedInvoice = {
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

  // Invoice number + date: "A-00002-00004740\n19/05/2026" or "B-00002-00001250\n19/11/2025"
  const numDateMatch = text.match(/([A-Z]-\d+-\d+)\n(\d{2}\/\d{2}\/\d{4})/)
  if (numDateMatch) {
    result.invoice_number = numDateMatch[1]
    result.issue_date = parseDate(numDateMatch[2])
  }

  // Client name on same line as "Sr. (es):"
  const clientNameMatch = text.match(/Sr\.\s*\(es\):\s*(.+)/)
  if (clientNameMatch) result.client_name = clientNameMatch[1].trim()

  // Client CUIT before "Cond. IVA:"
  const clientCuitMatch = text.match(/CUIT:\s*([\d-]+)\nCond\. IVA/)
  if (clientCuitMatch) result.client_cuit = clientCuitMatch[1].trim()

  // Currency
  result.currency = text.includes('Dólares') ? 'USD' : 'ARS'

  // Exchange rate (Cotización)
  const cotMatch = text.match(/Cotizaci[oó]n:\s*([\d.]+)/)
  if (cotMatch) result.exchange_rate = parseFloat(cotMatch[1])

  // Detail: text between address block and " 1.00 " quantity marker
  const detailMatch = text.match(/1135 CABA\.\n([\s\S]+?) 1\.00 /)
  if (detailMatch) result.detail = detailMatch[1].replace(/\n/g, ' ').trim()

  // ── Base amount (Bruto) ──
  // PDF layout puts "Bruto:" label and value in different text bands.
  // Strategy: try multiple extraction methods.

  let brutoText: string | null = null

  // Method 1 (ARS invoices): standalone number just before "-- 1 of 1 --"
  const bruto1 = text.match(/([\d,]+\.?\d*)\n\n-- 1 of 1 --/)
  if (bruto1) brutoText = bruto1[1]

  // Method 2 (USD invoices): value appears at end of page, after "Página 1" line
  if (!brutoText) {
    const bruto2 = text.match(/P[aá]gina\s+1\s*\n([\d,]+\.?\d*)/)
    if (bruto2) brutoText = bruto2[1]
  }

  // Method 3: last standalone decimal number in document (final fallback)
  if (!brutoText) {
    const bruto3 = text.trimEnd().match(/([\d,]+\.\d{2})\s*$/)
    if (bruto3) brutoText = bruto3[1]
  }

  if (brutoText) result.base_amount = parseNum(brutoText)

  // ── Tax rate: Impuestos / Bruto = alícuota total (IVA + IIBB) ──
  // The "Impuestos:" field in the PDF already includes all taxes combined.
  const impuestosMatch = text.match(/Impuestos:\s*([\d,]+\.?\d*)/)
  if (impuestosMatch && result.base_amount && result.base_amount > 0) {
    const impuestos = parseNum(impuestosMatch[1])
    result.iva_amount = impuestos
    // Round to 4 decimal places (e.g. 2754/10800 = 0.255)
    result.iva_rate = Math.round(impuestos / result.base_amount * 10000) / 10000
  } else {
    // Fallback: use first non-zero individual IVA rate
    const ivaRates: [string, number][] = [
      ['2\\.5', 0.025], ['5', 0.05], ['10\\.5', 0.105], ['21', 0.21], ['27', 0.27],
    ]
    for (const [label, rate] of ivaRates) {
      const m = text.match(new RegExp(`IVA ${label}:\\s*([\\d,]+\\.?\\d*)`))
      if (m && parseNum(m[1]) > 0) {
        result.iva_rate = rate
        result.iva_amount = parseNum(m[1])
        break
      }
    }
  }

  // Total (in original currency)
  const totalMatch = text.match(/Total:\s*(?:US\$|\$)?\s*([\d,]+\.?\d*)/)
  if (totalMatch) result.total_amount = parseNum(totalMatch[1])

  return result
}
