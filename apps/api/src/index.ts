import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import eventsRouter from './routes/events'
import eventLinesRouter from './routes/eventLines'
import providersRouter from './routes/providers'
import clientsRouter from './routes/clients'
import invoicesRouter from './routes/invoices'
import lineCategoriesRouter from './routes/lineCategories'
import { requireAuth } from './lib/requireAuth'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(s => s.trim())

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
      cb(null, true)
    } else {
      cb(new Error('Not allowed by CORS'))
    }
  }
}))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api', requireAuth)
app.use('/api/events', eventsRouter)
app.use('/api/event-lines', eventLinesRouter)
app.use('/api/providers', providersRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/invoices', invoicesRouter)
app.use('/api/line-categories', lineCategoriesRouter)

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`))

export default app
