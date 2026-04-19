import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { randomUUID } from 'crypto'
import { tmpdir } from 'os'
import path from 'path'

const execAsync = promisify(exec)
let whisperAvailable = true
let warned = false

export async function transcribeAudio(audioBuffer) {
  if (!whisperAvailable) return null

  const id = randomUUID()
  const inputPath = path.join(tmpdir(), `william_in_${id}.webm`)
  const wavPath = path.join(tmpdir(), `william_in_${id}.wav`)

  try {
    writeFileSync(inputPath, audioBuffer)

    await execAsync(`ffmpeg -i "${inputPath}" -ar 16000 -ac 1 "${wavPath}" -y -loglevel quiet`)

    const baseName = path.basename(wavPath, '.wav')
    const txtPath = path.join(tmpdir(), `${baseName}.txt`)

    await execAsync(
      `whisper "${wavPath}" --language es --model small --output_format txt --output_dir "${tmpdir()}" --fp16 False`
    )

    if (!existsSync(txtPath)) return null
    const text = readFileSync(txtPath, 'utf8').trim()

    for (const f of [inputPath, wavPath, txtPath]) {
      if (existsSync(f)) unlinkSync(f)
    }

    return text || null
  } catch (err) {
    for (const f of [inputPath, wavPath]) {
      if (existsSync(f)) unlinkSync(f)
    }
    if (!warned && (err.message.includes('whisper') || err.message.includes('not found') || err.message.includes('is not recognized'))) {
      warned = true
      whisperAvailable = false
      console.warn('[STT] Whisper no disponible — modo voz desactivado')
    }
    return null
  }
}
