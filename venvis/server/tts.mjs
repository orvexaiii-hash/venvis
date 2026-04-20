import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

const VOICE = 'es-AR-TomasNeural'

export async function textToSpeech(text) {
  const id = randomUUID()
  const outputPath = path.join(tmpdir(), `venvis_${id}.mp3`)
  const cleanText = text
    .replace(/\n/g, ' ')
    .replace(/[^\x20-\x7E\u00C0-\u024F\u00A0]/g, '')
    .slice(0, 500)

  const args = ['--voice', VOICE, '--text', cleanText, '--write-media', outputPath]

  try {
    try {
      await execFileAsync('edge-tts', args)
    } catch {
      await execFileAsync('python', ['-m', 'edge_tts', ...args])
    }
    if (!existsSync(outputPath)) return null
    let buffer
    try {
      buffer = readFileSync(outputPath)
    } finally {
      if (existsSync(outputPath)) unlinkSync(outputPath)
    }
    return buffer
  } catch (err) {
    console.error('[TTS] Error:', err.message)
    return null
  }
}
