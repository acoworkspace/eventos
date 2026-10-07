import { Router } from 'express'
import { supabase } from '../lib/supabase'
import { isConfirmed } from './quoteLines'

const router = Router()

const FIELDS = ['option_no', 'title', 'items', 'short_name', 'show_price', 'sort_order']

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f]
  return out
}

router.post('/', async (req, res) => {
  const { quote_id } = req.body
  if (!quote_id) return res.status(400).json({ error: 'quote_id is required' })
  if (await isConfirmed(quote_id)) return res.status(409).json({ error: 'La cotización ya está confirmada' })

  // Nuevo bloque al final
  const { data: last } = await supabase
    .from('quote_blocks')
    .select('sort_order')
    .eq('quote_id', quote_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('quote_blocks')
    .insert({ sort_order: (last?.sort_order ?? 0) + 1, ...pick(req.body), quote_id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { data: block } = await supabase.from('quote_blocks').select('quote_id').eq('id', req.params.id).single()
  if (block && await isConfirmed(block.quote_id)) return res.status(409).json({ error: 'La cotización ya está confirmada' })

  const { data, error } = await supabase
    .from('quote_blocks')
    .update(pick(req.body))
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// Las filas de costo del bloque quedan sin bloque (on delete set null), no se borran
router.delete('/:id', async (req, res) => {
  const { data: block } = await supabase.from('quote_blocks').select('quote_id').eq('id', req.params.id).single()
  if (block && await isConfirmed(block.quote_id)) return res.status(409).json({ error: 'La cotización ya está confirmada' })

  const { error } = await supabase.from('quote_blocks').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})

export default router
