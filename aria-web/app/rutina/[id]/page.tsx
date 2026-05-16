import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { redirect, notFound } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/')

  const { id } = await params
  const db = getDb()
  const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(session.phone) as { name: string } | undefined
  if (!user) redirect('/')

  const exercise = db.prepare(
    'SELECT id, name, muscle_group, description, image_url FROM exercises WHERE id = ?'
  ).get(Number(id)) as {
    id: number
    name: string
    muscle_group: string
    description: string
    image_url: string | null
  } | undefined

  if (!exercise) notFound()

  const assigned = db.prepare(
    `SELECT re.sets, re.reps, re.rest_seconds
     FROM routine_exercises re
     JOIN user_routines ur ON ur.routine_id = re.routine_id
     WHERE ur.phone = ? AND ur.active = 1 AND re.exercise_id = ?
     LIMIT 1`
  ).get(session.phone, exercise.id) as { sets: number; reps: string; rest_seconds: number | null } | undefined

  return (
    <>
      <Navbar name={user.name} />
      <main className="max-w-2xl mx-auto p-6">
        <Link href="/rutina" className="text-sm text-green-600 mb-5 inline-block">
          ← Volver a la rutina
        </Link>

        <h2 className="text-2xl font-semibold text-gray-900 mb-1">{exercise.name}</h2>
        <p className="text-sm text-gray-400 mb-6">{exercise.muscle_group}</p>

        {exercise.image_url && (
          <div className="rounded-2xl overflow-hidden mb-6 bg-gray-100">
            <img
              src={exercise.image_url}
              alt={exercise.name}
              className="w-full object-cover max-h-64"
            />
          </div>
        )}

        {assigned && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 mb-5">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Tu asignación</p>
            <div className="flex gap-8">
              <div>
                <p className="text-3xl font-bold text-green-700">{assigned.sets}</p>
                <p className="text-xs text-green-600 mt-0.5">series</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-green-700">{assigned.reps}</p>
                <p className="text-xs text-green-600 mt-0.5">reps</p>
              </div>
              {assigned.rest_seconds && (
                <div>
                  <p className="text-3xl font-bold text-green-700">{assigned.rest_seconds}s</p>
                  <p className="text-xs text-green-600 mt-0.5">descanso</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-100 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cómo hacerlo</p>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{exercise.description}</p>
        </div>
      </main>
    </>
  )
}
