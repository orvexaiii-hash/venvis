import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

const IMAGE_DIR = process.env.IMAGE_DIR || join(process.cwd(), 'data', 'images')

export function saveImage(phone, buffer, mimetype) {
  const dir = join(IMAGE_DIR, phone)
  mkdirSync(dir, { recursive: true })
  const ext = (mimetype || 'image/jpeg').split('/')[1] || 'jpg'
  const id = `${Date.now()}_${randomBytes(3).toString('hex')}.${ext}`
  writeFileSync(join(dir, id), buffer)
  return id
}

export function getImage(phone, id) {
  const safeName = id.replace(/[^a-zA-Z0-9._-]/g, '')
  const path = join(IMAGE_DIR, phone, safeName)
  if (!existsSync(path)) return null
  const buffer = readFileSync(path)
  const ext = safeName.split('.').pop().toLowerCase()
  const mimetype = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  return { buffer, mimetype }
}
