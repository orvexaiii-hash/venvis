import Link from 'next/link'

interface Props {
  label: string
  icon: string
  href: string
}

export default function ModuleCard({ label, icon, href }: Props) {
  return (
    <Link
      href={href}
      className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col items-center gap-3 hover:border-green-300 hover:shadow-sm transition-all"
    >
      <span className="text-4xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700 text-center">{label}</span>
    </Link>
  )
}
