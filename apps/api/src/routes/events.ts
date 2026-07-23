import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

router.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('events')
    .select('*, client:clients(id,name), event_lines(kind, category_label, neto, impuestos, total)')
    .order('event_date', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Compute a quick summary (ingresos - gastos) per event for the list view;
  // keep slim per-line data too, for the cash flow breakdown by category.
  // "Precio Servicio" es informativo (el monto total cotizado) y ya está compuesto
  // por Seña + Saldo — no se suma aparte para no duplicar el ingreso.
  const withResult = (data ?? []).map(ev => {
    const lines = (ev as any).event_lines ?? []
    const ingresos = lines
      .filter((l: any) => l.kind === 'ingreso' && l.category_label !== 'Precio Servicio')
      .reduce((s: number, l: any) => s + Number(l.total), 0)
    const gastos = lines.filter((l: any) => l.kind === 'gasto').reduce((s: number, l: any) => s + Number(l.total), 0)
    const { event_lines, ...rest } = ev as any
    return { ...rest, lines, ingresos, gastos, resultado: ingresos - gastos }
  })

  res.json(withResult)
})

router.get('/:id', async (req, res) => {
  const { data: event, error } = await supabase
    .from('events')
    .select('*, client:clients(id,name)')
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: error.message })

  const { data: lines, error: linesError } = await supabase
    .from('event_lines')
    .select('*, provider:providers(id,name,cuit,email,phone)')
    .eq('event_id', req.params.id)
    .order('kind')
    .order('sort_order')

  if (linesError) return res.status(500).json({ error: linesError.message })

  res.json({ ...event, event_lines: lines })
})

router.post('/', async (req, res) => {
  const { client_id, event_date, location, exchange_rate, notes } = req.body
  if (!client_id || !event_date) {
    return res.status(400).json({ error: 'client_id and event_date are required' })
  }

  const { data: event, error } = await supabase
    .from('events')
    .insert({ client_id, event_date, location, exchange_rate, notes })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Seed fixed lines from the category catalog
  const { data: categories, error: catError } = await supabase
    .from('line_categories')
    .select('*')
    .order('kind')
    .order('sort_order')

  if (catError) return res.status(500).json({ error: catError.message })

  const seedLines = (categories ?? []).map(c => ({
    event_id: event.id,
    kind: c.kind,
    category_id: c.id,
    category_label: c.name,
    sort_order: c.sort_order,
  }))

  if (seedLines.length) {
    const { error: seedError } = await supabase.from('event_lines').insert(seedLines)
    if (seedError) return res.status(500).json({ error: seedError.message })
  }

  res.status(201).json(event)
})

router.put('/:id', async (req, res) => {
  const { client_id, event_date, location, exchange_rate, notes } = req.body
  const { data, error } = await supabase
    .from('events')
    .update({ client_id, event_date, location, exchange_rate, notes })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('events').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})

export default router
