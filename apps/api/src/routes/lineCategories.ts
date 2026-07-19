import { Router } from 'express'
import { supabase } from '../lib/supabase'

const router = Router()

router.get('/', async (req, res) => {
  const { kind } = req.query
  let query = supabase.from('line_categories').select('*').order('sort_order')
  if (kind) query = query.eq('kind', kind)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router
