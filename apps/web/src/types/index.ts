export type LineKind = 'ingreso' | 'gasto'
export type LineStatus = 'pendiente' | 'pagado'

export interface Provider {
  id: string
  name: string
  cuit: string | null
  email: string | null
  phone: string | null
}

export interface Client {
  id: string
  name: string
  cuit: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export interface EventLine {
  id: string
  event_id: string
  kind: LineKind
  category_id: string | null
  category_label: string
  provider_id: string | null
  provider: Provider | null
  sort_order: number

  neto: number
  impuestos: number
  total: number

  has_invoice: boolean
  invoice_pdf_url: string | null
  invoice_number: string | null
  invoice_issue_date: string | null
  invoice_client_name: string | null
  invoice_client_cuit: string | null
  invoice_currency: string | null
  invoice_exchange_rate: number | null

  status: LineStatus
  payment_date: string | null
  payment_method: string | null
  receipt_url: string | null
  retention_url: string | null
}

export interface EventSummaryLine {
  kind: LineKind
  category_label: string
  neto: number
  impuestos: number
  total: number
}

export interface EventSummary {
  id: string
  client_id: string | null
  client: { id: string; name: string } | null
  event_date: string
  location: string | null
  exchange_rate: number | null
  lines: EventSummaryLine[]
  ingresos: number
  gastos: number
  resultado: number
}

export interface EventDetail {
  id: string
  client_id: string | null
  client: { id: string; name: string } | null
  event_date: string
  location: string | null
  exchange_rate: number | null
  notes: string | null
  event_lines: EventLine[]
}

export interface LineCategory {
  id: string
  kind: LineKind
  name: string
  sort_order: number
}

export interface ParsedInvoice {
  document_type: 'factura' | 'presupuesto'
  invoice_number: string | null
  issue_date: string | null
  client_name: string | null
  client_cuit: string | null
  detail: string | null
  base_amount: number | null
  iva_rate: number | null
  iva_amount: number | null
  total_amount: number | null
  currency: 'ARS' | 'USD'
  exchange_rate: number | null
}

export type QuoteStatus = 'borrador' | 'confirmada'

export interface QuoteLine {
  id: string
  quote_id: string
  block_id: string | null
  category_id: string | null
  category_label: string
  provider_id: string | null
  provider: Provider | null
  sort_order: number
  cost: number
  client_price: number
}

export interface QuoteBlock {
  id: string
  quote_id: string
  sort_order: number
  option_no: number | null
  title: string | null
  items: string | null
  short_name: string | null
  show_price: boolean
}

interface QuoteBase {
  id: string
  client_id: string | null
  client: { id: string; name: string } | null
  issue_date: string
  event_date: string | null
  location: string | null
  pax: number | null
  exchange_rate: number | null
  iva_rate: number
  contact_email: string | null
  contact_phone: string | null
  status: QuoteStatus
  chosen_option: number | null
  event_id: string | null
  confirmed_at: string | null
}

export interface QuoteOptionTotal {
  option: number | null
  costo: number
  precio: number
  ganancia: number
}

export interface QuoteSummary extends QuoteBase {
  options: QuoteOptionTotal[]
}

export interface QuoteDetail extends QuoteBase {
  quote_lines: QuoteLine[]
  quote_blocks: QuoteBlock[]
}
