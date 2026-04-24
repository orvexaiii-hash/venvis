import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { readFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

const VOICE = 'es-AR-TomasNeural'

function buildSSML(text) {
  const esc = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const withBreaks = esc.replace(/([.!?])\s+/g, '$1 <break time="300ms"/> ')
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="es-AR">` +
    `<voice name="${VOICE}"><prosody rate="-5%" pitch="-2Hz">${withBreaks}</prosody></voice></speak>`
}

export async function textToSpeech(text) {
  const id = randomUUID()
  const outputPath = path.join(tmpdir(), `venvis_${id}.mp3`)
  const cleanText = text
    .replace(/\n/g, ' ')
    .replace(/[^\x20-\x7EÀ-ɏ ]/g, '')
    .slice(0, 500)

  const ssml = buildSSML(cleanText)
  const ssmlArgs  = ['--ssml', ssml, '--write-media', outputPath]
  const plainArgs = ['--voice', VOICE, '--rate=-5%', '--pitch=-2Hz',
                     '--text', cleanText, '--write-media', outputPath]

  async function runTTS(args) {
    try {
      await execFileAsync('python3', ['-m', 'edge_tts', ...args])
    } catch {
      await execFileAsync('edge-tts', args)
    }
  }

  try {
    try {
      await runTTS(ssmlArgs)
    } catch {
      await runTTS(plainArgs)
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
