import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import * as OTPAuth from 'otpauth'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isProtectedPath, getProtectedPatterns } from '../src/security/patterns'
import { unlockSession, isSessionUnlocked, lockSession } from '../src/security/session'
import { assertFileAccess, ProtectedAccessError } from '../src/security/guard'
import { readNote, listNotes, searchNotes } from '../src/services/vault'
import { toolMap } from '../src/mcp/registry'

const TEST_VAULT = join(process.cwd(), 'scratch_test_vault')
const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP' // Standard Base32 TOTP secret

describe('MCP & Security System', () => {
  beforeEach(() => {
    // Setup environment variables
    Bun.env.VAULT_DIR = TEST_VAULT
    Bun.env.PROTECTED_FILE_PATTERNS = 'Private/**,*.secret.md,Finances/*'
    Bun.env.AUTH_TOTP_SECRET = TEST_TOTP_SECRET
    Bun.env.AUTH_SESSION_TTL_MINUTES = '5'

    // Create test vault structure
    mkdirSync(join(TEST_VAULT, 'Private'), { recursive: true })
    mkdirSync(join(TEST_VAULT, 'Public'), { recursive: true })
    mkdirSync(join(TEST_VAULT, 'People'), { recursive: true })

    writeFileSync(
      join(TEST_VAULT, 'Public', 'Notes.md'),
      '---\ntags: [general]\n---\n# Public Note\nThis is public content.'
    )

    writeFileSync(
      join(TEST_VAULT, 'Private', 'Diary.md'),
      '---\ntags: [private, journal]\n---\n# Secret Diary\nVery confidential info.'
    )

    writeFileSync(
      join(TEST_VAULT, 'passwords.secret.md'),
      '---\ntags: [passwords]\n---\n# Master Passwords\nBanking PIN: 9999'
    )

    writeFileSync(
      join(TEST_VAULT, 'People', 'Alice.md'),
      `---\nbirthday: 2000-${new Date().toISOString().slice(5, 10)}\n---\n# Alice`
    )
  })

  afterEach(() => {
    rmSync(TEST_VAULT, { recursive: true, force: true })
  })

  describe('Glob Pattern Matching', () => {
    it('correctly matches protected patterns and allows public files', () => {
      expect(isProtectedPath('Private/Diary.md')).toBe(true)
      expect(isProtectedPath('Private/Subfolder/Note.md')).toBe(true)
      expect(isProtectedPath('passwords.secret.md')).toBe(true)
      expect(isProtectedPath('Finances/Tax2026.md')).toBe(true)

      expect(isProtectedPath('Public/Notes.md')).toBe(false)
      expect(isProtectedPath('People/Alice.md')).toBe(false)
    })
  })

  describe('TOTP & Session Management', () => {
    it('rejects invalid 2FA codes and unlocks with valid TOTP code', () => {
      const sessionId = 'test-session-123'
      lockSession(sessionId)

      expect(isSessionUnlocked(sessionId)).toBe(false)

      // Invalid code
      const fail = unlockSession(sessionId, '000000')
      expect(fail.success).toBe(false)
      expect(isSessionUnlocked(sessionId)).toBe(false)

      // Generate valid TOTP token
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(TEST_TOTP_SECRET),
        digits: 6,
        period: 30,
      })
      const validToken = totp.generate()

      const success = unlockSession(sessionId, validToken)
      expect(success.success).toBe(true)
      expect(isSessionUnlocked(sessionId)).toBe(true)
    })
  })

  describe('Security Guard & Vault Access', () => {
    it('throws ProtectedAccessError when reading locked protected files', async () => {
      const sessionId = 'locked-session'
      lockSession(sessionId)

      // Public file should succeed
      const publicNote = await readNote('Public/Notes.md', sessionId)
      expect(publicNote.content).toContain('This is public content.')

      // Protected file should throw
      expect(readNote('Private/Diary.md', sessionId)).rejects.toThrow(ProtectedAccessError)

      // Unlock session with valid TOTP
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(TEST_TOTP_SECRET),
        digits: 6,
        period: 30,
      })
      unlockSession(sessionId, totp.generate())

      // Now reading protected file succeeds
      const privateNote = await readNote('Private/Diary.md', sessionId)
      expect(privateNote.content).toContain('Very confidential info.')
    })
  })

  describe('MCP Tools', () => {
    it('executes list_files and flags protected files', async () => {
      const listTool = toolMap.get('list_files')!
      const files = await listTool.execute({ recursive: true }, { sessionId: 's1' })
      expect(Array.isArray(files)).toBe(true)

      const diary = files.find((f: any) => f.path === 'Private/Diary.md')
      expect(diary.isProtected).toBe(true)

      const publicNote = files.find((f: any) => f.path === 'Public/Notes.md')
      expect(publicNote.isProtected).toBe(false)
    })

    it('executes search_notes and hides protected snippets when locked', async () => {
      const searchTool = toolMap.get('search_notes')!
      const sessionId = 'search-session'
      lockSession(sessionId)

      const results = await searchTool.execute({ query: 'confidential' }, { sessionId })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].requiresUnlock).toBe(true)
      expect(results[0].snippet).toContain('Protected content hidden')

      // Unlock and search again
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(TEST_TOTP_SECRET),
        digits: 6,
        period: 30,
      })
      unlockSession(sessionId, totp.generate())

      const unlockedResults = await searchTool.execute({ query: 'confidential' }, { sessionId })
      expect(unlockedResults[0].requiresUnlock).toBe(false)
      expect(unlockedResults[0].snippet).toContain('confidential')
    })

    it('executes get_birthdays tool', async () => {
      const bdayTool = toolMap.get('get_birthdays')!
      const results = await bdayTool.execute({}, { sessionId: 's1' })
      expect(results.length).toBe(1)
      expect(results[0].name).toBe('Alice')
    })
  })
})

