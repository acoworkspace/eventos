import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

// Add an extra line to an event (custom category also saved to the catalog for reuse)
router.post('/', async (req, res) => {
  const { event_id, kind, category_label, provider_id, neto, impuestos, sort_order } = req.body
  if (!event_id || !kind || !category_label) {
    return res.status(400).json({ error: 'event_id, kind and category_label are required' })
  }

  // Reuse existing category or create a new one so it's available for future events
  const { data: existingCategory } = await supabase
    .from('line_categories')
    .select('id')
    .eq('kind', kind)
    .eq('name', category_label)
    .maybeSingle()

  let categoryId = existingCategory?.id ?? null
  if (!categoryId) {
    const { data: newCategory, error: catError } = await supabase
      .from('line_categories')
      .insert({ kind, name: category_label, sort_order: sort_order ?? 999 })
      .select('id')
      .single()
    if (catError) return res.status(500).json({ error: catError.message })
    categoryId = newCategory.id
  }

  const { data, error } = await supabase
    .from('event_lines')
    .insert({
      event_id, kind, category_id: categoryId, category_label,
      provider_id, neto: neto ?? 0, impuestos: impuestos ?? 0,
      sort_order: sort_order ?? 999,
    })
    .select('*, provider:providers(id,name,cuit,email,phone)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { category_label, provider_id, neto, impuestos, has_invoice,
          invoice_pdf_url, invoice_number, invoice_issue_date, invoice_client_name,
          invoice_client_cuit, invoice_currency, invoice_exchange_rate } = req.body

  const update: Record<string, unknown> = {}
  if (category_label !== undefined) update.category_label = category_label
  if (provider_id !== undefined) update.provider_id = provider_id
  if (neto !== undefined) update.neto = neto
  if (impuestos !== undefined) update.impuestos = impuestos
  if (has_invoice !== undefined) update.has_invoice = has_invoice
  if (invoice_pdf_url !== undefined) update.invoice_pdf_url = invoice_pdf_url
  if (invoice_number !== undefined) update.invoice_number = invoice_number
  if (invoice_issue_date !== undefined) update.invoice_issue_date = invoice_issue_date
  if (invoice_client_name !== undefined) update.invoice_client_name = invoice_client_name
  if (invoice_client_cuit !== undefined) update.invoice_client_cuit = invoice_client_cuit
  if (invoice_currency !== undefined) update.invoice_currency = invoice_currency
  if (invoice_exchange_rate !== undefined) update.invoice_exchange_rate = invoice_exchange_rate

  const { data, error } = await supabase
    .from('event_lines')
    .update(update)
    .eq('id', req.params.id)
    .select('*, provider:providers(id,name,cuit,email,phone)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Mark as paid (with optional receipt/retention attachments) or revert to pending
router.patch('/:id/status', async (req, res) => {
  const { status, payment_date, payment_method, receipt_url, retention_url } = req.body
  if (!status || !['pendiente', 'pagado'].includes(status)) {
    return res.status(400).json({ error: 'status must be pendiente or pagado' })
  }

  const update: Record<string, unknown> = { status }

  if (status === 'pagado') {
    update.payment_date = payment_date || new Date().toISOString().split('T')[0]
    if (payment_method !== undefined) update.payment_method = payment_method
    if (receipt_url !== undefined) update.receipt_url = receipt_url
    if (retention_url !== undefined) update.retention_url = retention_url
  } else {
    // Back to pendiente: clear payment data and attachments
    update.payment_date = null
    update.payment_method = null
    update.receipt_url = null
    update.retention_url = null
  }

  const { data, error } = await supabase
    .from('event_lines')
    .update(update)
    .eq('id', req.params.id)
    .select('*, provider:providers(id,name,cuit,email,phone)')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('event_lines').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})

export default router
