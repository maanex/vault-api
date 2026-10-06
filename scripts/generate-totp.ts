import * as OTPAuth from 'otpauth'
import qrcode from 'qrcode-terminal'

const issuer = 'Obsidian Vault API'
const label = 'Agent 2FA'

// Generate 160-bit (20 byte) random secret
const secret = new OTPAuth.Secret({ size: 20 })
const base32Secret = secret.base32

const totp = new OTPAuth.TOTP({
  issuer,
  label,
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  secret,
})

const uri = totp.toString()

console.log('\n======================================================')
console.log('       🔐 Obsidian Vault API - 2FA Setup')
console.log('======================================================\n')
console.log('1. Scan this QR code with your authenticator app:')
console.log('   (Google Authenticator, 1Password, Authy, etc.)\n')

qrcode.generate(uri, { small: true })

console.log('\n2. Add this secret to your .env file:\n')
console.log(`AUTH_TOTP_SECRET=${base32Secret}\n`)
console.log('------------------------------------------------------')
console.log(`Current 6-digit verification code: ${totp.generate()}`)
console.log('======================================================\n')

