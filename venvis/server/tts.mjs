import { exec } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const execAsync = promisify(exec)

export async function textToSpeech(text) {
  const id = randomUUID()
  const outputPath = path.join(tmpdir(), `venvis_${id}.mp3`)
  const cleanText = text
    .replace(/"/g, "'")
    .replace(/\n/g, ' ')
    .replace(/[^\x20-\x7E\u00C0-\u024F\u00A0]/g, '')
    .slice(0, 500)

  const cmd1 = `edge-tts --voice "es-AR-TomasNeural" --text "${cleanText}" --write-media "${outputPath}"`
  const cmd2 = `python -m edge_tts --voice "es-AR-TomasNeural" --text "${cleanText}" --write-media "${outputPath}"`

  try {
    try {
      await execAsync(cmd1)
    } catch {
      await execAsync(cmd2)
    }
    if (!existsSync(outputPath)) return null
    const buffer = readFileSync(outputPath)
    unlinkSync(outputPath)
    return buffer
  } catch (err) {
    console.error('[TTS] Error:', err.message)
    return null
  }
}
