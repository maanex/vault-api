import picomatch from 'picomatch'
import { existsSync, readFileSync } from 'node:fs'

export function getProtectedPatterns(): string[] {
  const patterns: string[] = []

  // 1. Read from environment variable
  const envPatterns = Bun.env.PROTECTED_FILE_PATTERNS
  if (envPatterns) {
    const parsed = envPatterns
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean)
    patterns.push(...parsed)
  }

  // 2. Read from in-vault configuration file if present
  const vaultDir = Bun.env.VAULT_DIR || '/app/vault'
  const configFile = `${vaultDir}/.config/protected-patterns.json`
  if (existsSync(configFile)) {
    try {
      const content = readFileSync(configFile, 'utf-8')
      const json = JSON.parse(content)
      if (Array.isArray(json)) {
        patterns.push(...json.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))
      }
    } catch (err) {
      console.warn(`[Security] Failed to parse ${configFile}:`, err)
    }
  }

  return [...new Set(patterns)]
}

export function isProtectedPath(filePath: string): boolean {
  const patterns = getProtectedPatterns()
  if (patterns.length === 0) {
    return false
  }

  // Normalize path (strip leading slashes)
  const normalized = filePath.replace(/^\/+/, '')

  const isMatch = picomatch(patterns, {
    dot: true,
    nocase: true,
  })

  return isMatch(normalized)
}

