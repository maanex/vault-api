import { isProtectedPath } from './patterns'
import { isSessionUnlocked } from './session'

export class ProtectedAccessError extends Error {
  public readonly filePath: string
  public readonly requires2FA = true

  constructor(filePath: string) {
    const message = `Protected file access denied: '${filePath}' matches a protected pattern. Please ask the user for their 6-digit 2FA code and call the 'unlock_session' tool with the code to unlock access for this session.`
    super(message)
    this.name = 'ProtectedAccessError'
    this.filePath = filePath
  }
}

export function assertFileAccess(filePath: string, sessionId?: string): void {
  if (isProtectedPath(filePath)) {
    if (!sessionId || !isSessionUnlocked(sessionId)) {
      throw new ProtectedAccessError(filePath)
    }
  }
}

