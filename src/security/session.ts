import * as OTPAuth from 'otpauth'

interface SessionState {
  unlockedAt?: number
  expiresAt?: number
}

const sessions = new Map<string, SessionState>()

function getTOTPValidator(): OTPAuth.TOTP | null {
  const secretStr = Bun.env.AUTH_TOTP_SECRET?.trim()
  if (!secretStr) {
    return null
  }

  let secret: OTPAuth.Secret
  try {
    // Attempt standard Base32 parsing first (common for TOTP authenticator secrets)
    secret = OTPAuth.Secret.fromBase32(secretStr.replace(/\s+/g, '').toUpperCase())
  } catch {
    // Fallback to raw string / UTF-8
    secret = OTPAuth.Secret.fromUTF8(secretStr)
  }

  return new OTPAuth.TOTP({
    issuer: 'ObsidianVaultAPI',
    label: 'AgentAccess',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  })
}

export function isSessionUnlocked(sessionId: string): boolean {
  if (!sessionId) return false
  const state = sessions.get(sessionId)
  if (!state || !state.expiresAt) return false

  if (Date.now() > state.expiresAt) {
    sessions.delete(sessionId)
    return false
  }

  return true
}

export function getSessionRemainingSeconds(sessionId: string): number {
  const state = sessions.get(sessionId)
  if (!state || !state.expiresAt) return 0
  const remaining = Math.floor((state.expiresAt - Date.now()) / 1000)
  return Math.max(0, remaining)
}

export function unlockSession(
  sessionId: string,
  code: string
): { success: boolean; message: string; expiresAt?: number; remainingMinutes?: number } {
  if (!sessionId) {
    return { success: false, message: 'Invalid or missing session ID.' }
  }

  const totp = getTOTPValidator()
  if (!totp) {
    return {
      success: false,
      message: '2FA authentication is not configured on the server (AUTH_TOTP_SECRET is not set).',
    }
  }

  const cleanCode = code.replace(/\s+/g, '').trim()
  // Validate with +/- 1 time step window (30s) to handle slight clock drift
  const delta = totp.validate({ token: cleanCode, window: 1 })

  if (delta === null) {
    return {
      success: false,
      message: 'Invalid 2FA code. Please verify the code from your authenticator app and try again.',
    }
  }

  const ttlMinutes = Math.max(1, Number(Bun.env.AUTH_SESSION_TTL_MINUTES || 5))
  const expiresAt = Date.now() + ttlMinutes * 60 * 1000

  sessions.set(sessionId, {
    unlockedAt: Date.now(),
    expiresAt,
  })

  return {
    success: true,
    message: `Session unlocked successfully. Access to protected files is granted for ${ttlMinutes} minute(s).`,
    expiresAt,
    remainingMinutes: ttlMinutes,
  }
}

export function lockSession(sessionId: string): void {
  sessions.delete(sessionId)
}

