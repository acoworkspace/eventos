import { Request, Response, NextFunction } from 'express'
import { supabase } from './supabase'

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Missing Authorization header' })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return res.status(401).json({ error: 'Invalid or expired token' })

  // Usuario logueado, para lo que es por persona (ej. su Google Calendar)
  res.locals.user = { id: data.user.id, email: data.user.email ?? null }
  next()
}
