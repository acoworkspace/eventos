import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

router.get('/', async (_req, res) => {
  const { data, error } = await supabase.from('clients').select('*').order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { name, cuit, email, phone, notes } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const { data, error } = await supabase
    .from('clients')
    .insert({ name, cuit, email, phone, notes })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

router.put('/:id', async (req, res) => {
  const { name, cuit, email, phone, notes } = req.body
  const { data, error } = await supabase
    .from('clients')
    .update({ name, cuit, email, phone, notes })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
