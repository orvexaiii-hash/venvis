import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ModuleCard from '@/components/ModuleCard'

const MODULE_META: Record<string, { label: string; icon: string; href: string }> = {
  rutina: { label: 'Rutina de ejercicios', icon: '💪', href: '/rutina' }
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const db = getDb()
  const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(session.phone) as { name: string }
  const modules = db.prepare(
    'SELECT module FROM user_modules WHERE phone = ? AND active = 1'
  ).all(session.phone) as { module: string }[]

  if (modules.length === 0) redirect('/catalogo')

  return (
    <>
      <Navbar name={user.name} />
      <main className="max-w-2xl mx-auto p-6">
        <h2 className="text-base font-medium text-gray-700 mb-5">Tus módulos</h2>
        <div className="grid grid-cols-2 gap-4">
          {modules.map(m => {
            const meta = MODULE_META[m.module]
            if (!meta) return null
            return <ModuleCard key={m.module} {...meta} />
          })}
        </div>
      </main>
    </>
  )
}
