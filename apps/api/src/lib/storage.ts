import { supabase } from './supabase'

export type BucketName = 'facturas' | 'comprobantes'

export async function uploadToBucket(bucket: BucketName, buffer: Buffer, originalName: string, mimetype: string) {
  const filename = `${Date.now()}-${originalName.replace(/[^a-z0-9.-]/gi, '_')}`

  const { error } = await supabase.storage.from(bucket).upload(filename, buffer, { contentType: mimetype })
  if (error) throw error

  return signUrl(bucket, filename)
}

export async function signUrl(bucket: BucketName, path: string, expiresInSeconds = 60 * 60) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return { path, url: data.signedUrl }
}
