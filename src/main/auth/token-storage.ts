import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

function tokenPath(provider: 'github' | 'gitlab' = 'github'): string {
  return join(app.getPath('userData'), provider === 'github' ? 'token.bin' : 'gitlab-token.bin')
}

export function saveToken(token: string, provider: 'github' | 'gitlab' = 'github'): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Keychain isn't available, so the token can't be saved")
  }
  writeFileSync(tokenPath(provider), safeStorage.encryptString(token))
}

export function loadToken(provider: 'github' | 'gitlab' = 'github'): string | null {
  let encrypted: Buffer
  try {
    encrypted = readFileSync(tokenPath(provider))
  } catch (error) {
    // No token file yet is the normal first-run/signed-out path — stay
    // silent. Anything else (permissions, a half-written file) is worth
    // knowing about, but still means "no usable token right now".
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[token-storage] failed to read the token file', error)
    }
    return null
  }

  try {
    return safeStorage.decryptString(encrypted)
  } catch (error) {
    // Keychain access may be denied temporarily, for example when the user
    // cancels macOS's prompt after an app update. Keep the encrypted file so
    // a later launch can retry. Signing in again or signing out explicitly
    // replaces/removes it when the user chooses to do so.
    console.error('[token-storage] failed to decrypt the stored token', error)
    return null
  }
}

export function clearToken(provider: 'github' | 'gitlab' = 'github'): void {
  rmSync(tokenPath(provider), { force: true })
}
