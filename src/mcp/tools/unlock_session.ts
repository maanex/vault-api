import { z } from 'zod'
import { createTool } from '../types'
import { unlockSession } from '../../security/session'

export const unlockSessionTool = createTool({
  name: 'unlock_session',
  description:
    'Unlock access to protected Obsidian vault files for the current session by providing a 6-digit TOTP 2FA code from the user.',
  schema: z.object({
    code: z
      .string()
      .describe('The 6-digit 2FA verification code from the user’s authenticator app (e.g. 123456).'),
  }),
  execute: async ({ code }, context) => {
    const result = unlockSession(context.sessionId, code)
    if (!result.success) {
      throw new Error(result.message)
    }
    return result
  },
})

