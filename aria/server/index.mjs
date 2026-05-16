import 'node:process'
import { startWhatsApp, sendMessage, stopWhatsApp } from './whatsapp.mjs'
import { startReminderTick, getTodayReminders, getPendingWebOTPs, markOTPSent, getWorkoutUsersForToday } from './reminders.mjs'
import { listUsers } from './users.mjs'
import { deleteExpiredMemories } from './memory.mjs'

async function sendDailySummary() {
  const TZ = 'America/Argentina/Buenos_Aires'
  const users = listUsers().filter(u => u.active && u.name)

  for (const user of users) {
    const today = getTodayReminders(user.phone)

    let msg
    if (today.length === 0) {
      msg = `Buenos días ${user.name}! No tenés nada agendado para hoy.`
    } else {
      const items = today.map(r => {
        const time = new Date(r.remind_at).toLocaleTimeString('es-AR', {
          hour: '2-digit', minute: '2-digit', timeZone: TZ
        })
        return `• ${time} — ${r.text}`
      }).join('\n')
      msg = `Buenos días ${user.name}! ☀️\nHoy tenés:\n${items}`
    }

    try {
      await sendMessage(user.phone, msg)
    } catch (err) {
      console.error(`[DailySummary] Error enviando a ${user.phone}:`, err.message)
    }
  }
}

async function sendPendingOTPs() {
  const otps = getPendingWebOTPs()
  for (const otp of otps) {
    try {
      await sendMessage(otp.phone, `Tu código de acceso a Aria: *${otp.code}*. Expira en 5 minutos.`)
      markOTPSent(otp.id)
    } catch (err) {
      console.error(`[OTP] Error enviando a ${otp.phone}:`, err.message)
    }
  }
}

async function sendWorkoutReminders() {
  const webUrl = process.env.ARIA_WEB_URL || ''
  const users = getWorkoutUsersForToday()
  for (const u of users) {
    try {
      const link = webUrl ? `\nAbrí la app para ver los ejercicios: ${webUrl}/rutina` : ''
      await sendMessage(u.phone, `Hoy toca *${u.routine_name}* 💪${link}`)
    } catch (err) {
      console.error(`[Workout] Error enviando a ${u.phone}:`, err.message)
    }
  }
}

async function sendWorkoutFollowUp() {
  const users = getWorkoutUsersForToday()
  for (const u of users) {
    try {
      await sendMessage(u.phone, `¿Entrenaste hoy? Respondé *listo* cuando termines 🏋️`)
    } catch (err) {
      console.error(`[WorkoutFollowUp] Error enviando a ${u.phone}:`, err.message)
    }
  }
}

async function main() {
  await startWhatsApp()

  startReminderTick(
    async (reminder) => {
      try {
        await sendMessage(reminder.phone, `⏰ Recordatorio: ${reminder.text}`)
      } catch (err) {
        console.error(`[Reminder] Error enviando a ${reminder.phone}:`, err.message)
      }
    },
    async () => {
      await sendDailySummary()
      await sendWorkoutReminders()
    },
    deleteExpiredMemories,
    sendPendingOTPs,
    sendWorkoutFollowUp
  )

  console.log('[Aria] Listo.')
}

async function shutdown(signal) {
  console.log(`[Aria] ${signal} recibido, apagando...`)
  await stopWhatsApp()
  process.exit(0)
}

process.on('SIGINT',  () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

main().catch(console.error)
