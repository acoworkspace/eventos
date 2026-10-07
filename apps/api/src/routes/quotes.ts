import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

const LINE_SELECT = '*, provider:providers(id,name,cuit,email,phone)'

const EDITABLE_FIELDS = [
  'client_id', 'issue_date', 'event_date', 'location', 'pax', 'exchange_rate',
  'iva_rate', 'contact_email', 'contact_phone',
] as const

type LineLite = { cost: number | string; client_price: number | string; block_id: string | null }
type BlockLite = { id: string; option_no: number | null }

// Una fila entra en la opción N si está en un bloque de esa opción, en un bloque común o en ningún bloque.
function lineInOption(line: LineLite, blocks: BlockLite[], option: number | null) {
  const block = blocks.find(b => b.id === line.block_id)
  return !block || block.option_no == null || block.option_no === option
}

function optionNumbers(blocks: BlockLite[]) {
  return [...new Set(blocks.map(b => b.option_no).filter((n): n is number => n != null))].sort((a, b) => a - b)
}

function optionTotals(lines: LineLite[], blocks: BlockLite[]) {
  const options = optionNumbers(blocks)
  return (options.length ? options : [null]).map(option => {
    const ls = lines.filter(l => lineInOption(l, blocks, option))
    const costo = ls.reduce((s, l) => s + Number(l.cost), 0)
    const precio = ls.reduce((s, l) => s + Number(l.client_price), 0)
    return { option, costo, precio, ganancia: precio - costo }
  })
}

function pickEditable(body: Record<string, unknown>) {
  const update: Record<string, unknown> = {}
  for (const f of EDITABLE_FIELDS) if (body[f] !== undefined) update[f] = body[f]
  return update
}

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('quotes')
    .select('*, client:clients(id,name), quote_lines(cost, client_price, block_id), quote_blocks(id, option_no)')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const withTotals = (data ?? []).map(q => {
    const { quote_lines, quote_blocks, ...rest } = q as any
    return { ...rest, options: optionTotals(quote_lines ?? [], quote_blocks ?? []) }
  })

  res.json(withTotals)
})

router.get('/:id', async (req, res) => {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*, client:clients(id,name,cuit)')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: error.message })

  const [{ data: lines, error: linesError }, { data: blocks, error: blocksError }] = await Promise.all([
    supabase.from('quote_lines').select(LINE_SELECT).eq('quote_id', req.params.id).order('sort_order').order('created_at'),
    supabase.from('quote_blocks').select('*').eq('quote_id', req.params.id).order('sort_order').order('created_at'),
  ])

  if (linesError) return res.status(500).json({ error: linesError.message })
  if (blocksError) return res.status(500).json({ error: blocksError.message })

  res.json({ ...quote, quote_lines: lines, quote_blocks: blocks })
})

router.post('/', async (req, res) => {
  const { data: quote, error } = await supabase
    .from('quotes')
    .insert(pickEditable(req.body ?? {}))
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Igual que un evento: arranca con las líneas de gasto del catálogo
  const { data: categories, error: catError } = await supabase
    .from('line_categories')
    .select('*')
    .eq('kind', 'gasto')
    .order('sort_order')

  if (catError) return res.status(500).json({ error: catError.message })

  const seedLines = (categories ?? []).map(c => ({
    quote_id: quote.id,
    category_id: c.id,
    category_label: c.name,
    sort_order: c.sort_order,
  }))

  if (seedLines.length) {
    const { error: seedError } = await supabase.from('quote_lines').insert(seedLines)
    if (seedError) return res.status(500).json({ error: seedError.message })
  }

  res.status(201).json(quote)
})

router.put('/:id', async (req, res) => {
  const { data: current } = await supabase.from('quotes').select('status').eq('id', req.params.id).single()
  if (current?.status === 'confirmada') {
    return res.status(409).json({ error: 'La cotización ya está confirmada' })
  }

  const { data, error } = await supabase
    .from('quotes')
    .update(pickEditable(req.body ?? {}))
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('quotes').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})

// Confirmar: crea el evento con los costos de la opción elegida (más lo común) como gastos, y
// su precio al cliente como ingresos (Precio Servicio = total; Seña y Saldo = 50% cada uno).
router.post('/:id/confirm', async (req, res) => {
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: error.message })
  if (quote.status === 'confirmada') {
    return res.status(409).json({ error: 'La cotización ya está confirmada', event_id: quote.event_id })
  }
  if (!quote.client_id || !quote.event_date) {
    return res.status(400).json({ error: 'Para confirmar hace falta cliente y fecha del evento' })
  }

  const [{ data: allLines, error: linesError }, { data: blocks, error: blocksError }, { data: categories, error: catError }] = await Promise.all([
    supabase.from('quote_lines').select('*').eq('quote_id', quote.id).order('sort_order').order('created_at'),
    supabase.from('quote_blocks').select('id, option_no').eq('quote_id', quote.id),
    supabase.from('line_categories').select('*').eq('kind', 'ingreso').order('sort_order'),
  ])
  if (linesError) return res.status(500).json({ error: linesError.message })
  if (blocksError) return res.status(500).json({ error: blocksError.message })
  if (catError) return res.status(500).json({ error: catError.message })

  const options = optionNumbers(blocks ?? [])
  const chosen = req.body?.option_no == null ? null : Number(req.body.option_no)
  if (options.length && !options.includes(chosen as number)) {
    return res.status(400).json({ error: `Elegí qué opción confirmó el cliente (${options.join(', ')})` })
  }
  const lines = (allLines ?? []).filter(l => lineInOption(l, blocks ?? [], options.length ? chosen : null))

  const { data: event, error: eventError } = await supabase
    .from('events')
    .insert({
      client_id: quote.client_id,
      event_date: quote.event_date,
      location: quote.location,
      exchange_rate: quote.exchange_rate,
    })
    .select()
    .single()

  if (eventError) return res.status(500).json({ error: eventError.message })

  const neto = lines.reduce((s, l) => s + Number(l.client_price), 0)
  const iva = Math.round(neto * Number(quote.iva_rate) / 100)
  const senaNeto = Math.round(neto / 2)
  const senaIva = Math.round(iva / 2)
  const ingresoAmounts: Record<string, { neto: number; impuestos: number }> = {
    'Precio Servicio': { neto, impuestos: iva },
    'Seña': { neto: senaNeto, impuestos: senaIva },
    'Saldo': { neto: neto - senaNeto, impuestos: iva - senaIva },
  }

  const ingresoLines = (categories ?? []).map(c => ({
    event_id: event.id,
    kind: 'ingreso',
    category_id: c.id,
    category_label: c.name,
    sort_order: c.sort_order,
    neto: ingresoAmounts[c.name]?.neto ?? 0,
    impuestos: ingresoAmounts[c.name]?.impuestos ?? 0,
  }))

  // Pasan todas las filas de la opción, también las que no estaban en ningún bloque (no visibles al cliente)
  const gastoLines = lines.map(l => ({
    event_id: event.id,
    kind: 'gasto',
    category_id: l.category_id,
    category_label: l.category_label,
    provider_id: l.provider_id,
    sort_order: l.sort_order,
    neto: Number(l.cost),
    impuestos: 0,
  }))

  const { error: insertError } = await supabase.from('event_lines').insert([...ingresoLines, ...gastoLines])
  if (insertError) {
    await supabase.from('events').delete().eq('id', event.id)
    return res.status(500).json({ error: insertError.message })
  }

  const { data: updated, error: updateError } = await supabase
    .from('quotes')
    .update({ status: 'confirmada', chosen_option: options.length ? chosen : null, event_id: event.id, confirmed_at: new Date().toISOString() })
    .eq('id', quote.id)
    .eq('status', 'borrador')   // si otro request la confirmó en el medio, no duplicar el evento
    .select()
    .maybeSingle()

  if (updateError || !updated) {
    await supabase.from('events').delete().eq('id', event.id)
    return updateError
      ? res.status(500).json({ error: updateError.message })
      : res.status(409).json({ error: 'La cotización ya está confirmada' })
  }

  res.json(updated)
})

export default router
