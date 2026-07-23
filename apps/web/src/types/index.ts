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
