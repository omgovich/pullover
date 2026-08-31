import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

function tokenPath(): string {
  return join(app.getPath('userData'), 'token.bin')
}

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Keychain недоступен — не могу сохранить токен')
  }
  writeFileSync(tokenPath(), safeStorage.encryptString(token))
}

export function loadToken(): string | null {
  try {
    const encrypted = readFileSync(tokenPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

export function clearToken(): void {
  rmSync(tokenPath(), { force: true })
}
