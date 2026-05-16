import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Link from 'next/link'

const ALL_MODULES = [
  { id: 'rutina',     label: 'Rutina de ejercicios', icon: '💪', available: true },
  { id: 'dieta',      label: 'Dieta / nutrición',    icon: '🥗', available: false },
  { id: 'finanzas',   label: 'Finanzas',             icon: '💰', available: false },
  { id: 'documentos', label: 'Documentos',           icon: '📄', available: false },
  { id: 'calendario', label: 'Calendario (iPhone)',  icon: '📅', available: false },
]

export default async function CatalogoPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const db = getDb()
  const user = db.prepare('SELECT name FROM users WHERE phone = ?').get(session.phone) as { name: string } | undefined
  if (!user) redirect('/')
  const active = db.prepare(
    'SELECT module FROM user_modules WHERE phone = ? AND active = 1'
  ).all(session.phone) as { module: string }[]
  const activeSet = new Set(active.map(m => m.module))

  return (
    <>
      <Navbar name={user.name} />
      <main className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-medium text-gray-700">Módulos disponibles</h2>
          {activeSet.size > 0 && (
            <Link href="/dashboard" className="text-sm text-green-600">Ver mis módulos</Link>
          )}
        </div>
        <div className="space-y-3">
          {ALL_MODULES.map(m => (
            <div key={m.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4">
              <span className="text-3xl">{m.icon}</span>
              <div className="flex-1">
                <p className="font-medium text-gray-800 text-sm">{m.label}</p>
                {!m.available && (
                  <p className="text-xs text-gray-400 mt-0.5">Próximamente</p>
                )}
              </div>
              {activeSet.has(m.id) ? (
                <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">Activo</span>
              ) : !m.available ? (
                <span className="text-lg">🔒</span>
              ) : (
                <span className="text-xs text-gray-400 text-right">Contactá<br/>al admin</span>
              )}
            </div>
          ))}
        </div>
      </main>
    </>
  )
}
