import Link from 'next/link'

export default function Navbar({ name }: { name: string }) {
  return (
    <nav className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
      <Link href="/dashboard" className="text-base font-semibold text-gray-900">
        Aria
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{name}</span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Salir
          </button>
        </form>
      </div>
    </nav>
  )
}
