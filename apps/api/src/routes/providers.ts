import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

router.get('/', async (_req, res) => {
  const { data, error } = await supabase.from('providers').select('*').order('name')
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/', async (req, res) => {
  const { name, cuit } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })

  const { data, error } = await supabase
    .from('providers')
    .insert({ name, cuit })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
})

export default router
