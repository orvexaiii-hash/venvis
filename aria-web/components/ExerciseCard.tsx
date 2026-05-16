import Link from 'next/link'

interface Exercise {
  exercise_id: number
  name: string
  muscle_group: string
  sets: number
  reps: string
}

export default function ExerciseCard({ exercise }: { exercise: Exercise }) {
  return (
    <Link
      href={`/rutina/${exercise.exercise_id}`}
      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:border-green-300 transition-colors"
    >
      <div>
        <p className="text-sm font-medium text-gray-800">{exercise.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">{exercise.muscle_group}</p>
      </div>
      <span className="text-sm text-gray-500 font-mono ml-4 shrink-0">{exercise.sets}×{exercise.reps}</span>
    </Link>
  )
}
