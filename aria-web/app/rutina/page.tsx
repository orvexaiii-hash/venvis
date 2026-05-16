import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ExerciseCard from '@/components/ExerciseCard'
import Link from 'next/link'

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const DAY_LABELS: Record<string, string> = {
  MON: 'Lunes', TUE: 'Martes', WED: 'Miércoles',
  THU: 'Jueves', FRI: 'Viernes', SAT: 'Sábado', SUN: 'Domingo'
}

type Exercise = {
  exercise_id: number
  name: string
  muscle_group: string
  sets: number
  reps: string
  day_of_week: string
  order_index: number
}

export default async function RutinaPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const db = getDb()
  const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(session.phone) as { name: string } | undefined
  if (!user) redirect('/')

  const userRoutine = db.prepare(
    `SELECT r.id as routine_id, r.name as routine_name
     FROM user_routines ur
     JOIN routines r ON r.id = ur.routine_id
     WHERE ur.phone = ? AND ur.active = 1 LIMIT 1`
  ).get(session.phone) as { routine_id: number; routine_name: string } | undefined

  if (!userRoutine) {
    return (
      <>
        <Navbar name={user.name} />
        <main className="max-w-2xl mx-auto p-6">
          <p className="text-gray-500 text-sm">No tenés una rutina asignada todavía. Contactá al admin.</p>
          <Link href="/dashboard" className="text-green-600 text-sm mt-3 inline-block">← Volver</Link>
        </main>
      </>
    )
  }

  const exercises = db.prepare(
    `SELECT re.day_of_week, re.sets, re.reps, re.order_index,
            e.id as exercise_id, e.name, e.muscle_group
     FROM routine_exercises re
     JOIN exercises e ON e.id = re.exercise_id
     WHERE re.routine_id = ?
     ORDER BY re.day_of_week, re.order_index`
  ).all(userRoutine.routine_id) as Exercise[]

  const byDay: Record<string, Exercise[]> = {}
  for (const ex of exercises) {
    if (!byDay[ex.day_of_week]) byDay[ex.day_of_week] = []
    byDay[ex.day_of_week].push(ex)
  }

  const todayDOW = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(new Date()).toUpperCase()

  return (
    <>
      <Navbar name={user.name} />
      <main className="max-w-2xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">←</Link>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{userRoutine.routine_name}</h2>
            <p className="text-xs text-gray-400">Rutina semanal</p>
          </div>
        </div>

        <div className="space-y-3">
          {DAYS.map(day => {
            const isToday = day === todayDOW
            const dayExercises = byDay[day]
            return (
              <div
                key={day}
                className={`rounded-2xl border p-5 ${isToday ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-white'}`}
              >
                <p className={`text-sm font-semibold mb-3 ${isToday ? 'text-green-700' : 'text-gray-700'}`}>
                  {DAY_LABELS[day]}{isToday ? ' · Hoy' : ''}
                </p>
                {dayExercises ? (
                  <div className="space-y-2">
                    {dayExercises.map(ex => <ExerciseCard key={ex.exercise_id} exercise={ex} />)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Descanso 🛌</p>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </>
  )
}
