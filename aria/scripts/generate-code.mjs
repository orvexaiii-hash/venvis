import { createActivationCode } from '../server/users.mjs'

const phone = process.argv[2]

if (!phone || !/^\d{10,15}$/.test(phone)) {
  console.error('Uso: node scripts/generate-code.mjs <numero_sin_+>')
  console.error('Ejemplo: node scripts/generate-code.mjs 5491112345678')
  process.exit(1)
}

const code = createActivationCode(phone)
console.log(`\nCódigo generado para ${phone}:`)
console.log(`\n  ${code}\n`)
console.log('Expira en 48 horas. Mandáselo al cliente.')
