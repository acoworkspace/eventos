import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

const LINE_SELECT = '*, provider:providers(id,name,cuit,email,phone)'

export async function isConfirmed(quoteId: string) {
  const { data } = await supabase.from('quotes').select('status').eq('id', quoteId).single()
  return data?.status === 'confirmada'
}

// Nueva fila de costo (la categoría custom queda en el catálogo, igual que en eventos)
router.post('/', async (req, res) => {
  const { quote_id, category_label, provider_id, block_id, cost, client_price, sort_order } = req.body
  if (!quote_id || !category_label) {
    return res.status(400).json({ error: 'quote_id and category_label are required' })
  }
  if (await isConfirmed(quote_id)) {
    return res.status(409).json({ error: 'La cotización ya está confirmada' })
  }

  const { data: existingCategory } = await supabase
    .from('line_categories')
    .select('id')
    .eq('kind', 'gasto')
    .eq('name', category_label)
    .maybeSingle()

  let categoryId = existingCategory?.id ?? null
  if (!categoryId) {
    const { data: newCategory, error: catError } = await supabase
      .from('line_categories')
      .insert({ kind: 'gasto', name: category_label, sort_order: sort_order ?? 999 })
      .select('id')
      .single()
    if (catError) return res.status(500).json({ error: catError.message })
    categoryId = newCategory.id
  }

  const { data, error } = await supabase
    .from('quote_lines')
    .insert({
      quote_id, category_id: categoryId, category_label, provider_id, block_id,
      cost: cost ?? 0, client_price: client_price ?? 0,
      sort_order: sort_order ?? 999,
    })
    .select(LINE_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { data: line } = await supabase.from('quote_lines').select('quote_id').eq('id', req.params.id).single()
  if (line && await isConfirmed(line.quote_id)) {
    return res.status(409).json({ error: 'La cotización ya está confirmada' })
  }

  const fields = ['category_label', 'provider_id', 'block_id', 'cost', 'client_price', 'sort_order']
  const update: Record<string, unknown> = {}
  for (const f of fields) if (req.body[f] !== undefined) update[f] = req.body[f]

  const { data, error } = await supabase
    .from('quote_lines')
    .update(update)
    .eq('id', req.params.id)
    .select(LINE_SELECT)
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/:id', async (req, res) => {
  const { data: line } = await supabase.from('quote_lines').select('quote_id').eq('id', req.params.id).single()
  if (line && await isConfirmed(line.quote_id)) {
    return res.status(409).json({ error: 'La cotización ya está confirmada' })
  }

  const { error } = await supabase.from('quote_lines').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
})

export default router
