'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function requestOTP(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data?.error ?? 'Error inesperado'); return }
    setStep('code')
  }

  async function verifyOTP(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code })
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data?.error ?? 'Error inesperado'); return }
    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Aria</h1>
        <p className="text-gray-400 text-sm mb-8">Tu agenda personal</p>

        {step === 'phone' ? (
          <form onSubmit={requestOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Número de WhatsApp
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="549351XXXXXXX"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Enviando...' : 'Recibir código por WhatsApp'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOTP} className="space-y-4">
            <p className="text-sm text-gray-500">
              Código enviado al +{phone}.{' '}
              <button type="button" onClick={() => { setStep('phone'); setError('') }} className="text-green-600 underline">
                Cambiar número
              </button>
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Código de 6 dígitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-green-400"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-green-500 text-white rounded-xl py-3 text-sm font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
