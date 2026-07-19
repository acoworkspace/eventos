import { Router } from 'express'
import multer from 'multer'
import { parseInvoicePdf } from '../lib/invoiceParser'
import { uploadToBucket, signUrl, BucketName } from '../lib/storage'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

const VALID_BUCKETS: BucketName[] = ['facturas', 'comprobantes']

// Extract invoice data directly from PDF (no external API)
router.post('/extract', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' })

  try {
    const extracted = await parseInvoicePdf(req.file.buffer)
    res.json(extracted)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Upload a PDF (factura, comprobante or retencion) to the given Storage bucket
router.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'PDF file required' })

  const bucket = req.body.bucket as BucketName
  if (!VALID_BUCKETS.includes(bucket)) {
    return res.status(400).json({ error: `bucket must be one of: ${VALID_BUCKETS.join(', ')}` })
  }

  try {
    const result = await uploadToBucket(bucket, req.file.buffer, req.file.originalname, req.file.mimetype)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// Re-sign a stored path to get a fresh viewable URL (signed URLs expire)
router.get('/sign', async (req, res) => {
  const { bucket, path } = req.query
  if (!VALID_BUCKETS.includes(bucket as BucketName) || typeof path !== 'string') {
    return res.status(400).json({ error: 'bucket and path are required' })
  }

  try {
    const result = await signUrl(bucket as BucketName, path)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
