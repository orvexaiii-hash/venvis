import { generateOTP, signJWT, verifyJWT } from '@/lib/auth'

beforeAll(() => { process.env.JWT_SECRET = 'test_secret_12345678901234567890' })
afterAll(() => { delete process.env.JWT_SECRET })

describe('generateOTP', () => {
  it('devuelve string de 6 dígitos', () => {
    const otp = generateOTP()
    expect(otp).toMatch(/^\d{6}$/)
  })

  it('genera valores distintos', () => {
    const otps = new Set(Array.from({ length: 20 }, generateOTP))
    expect(otps.size).toBe(20)
  })
})

describe('signJWT / verifyJWT', () => {
  it('round-trip funciona', async () => {
    const token = await signJWT({ phone: '5493512401355' })
    const payload = await verifyJWT(token)
    expect(payload?.phone).toBe('5493512401355')
  })

  it('token inválido devuelve null', async () => {
    const result = await verifyJWT('token.invalido.xxx')
    expect(result).toBeNull()
  })

  it('token vacío devuelve null', async () => {
    const result = await verifyJWT('')
    expect(result).toBeNull()
  })
})
