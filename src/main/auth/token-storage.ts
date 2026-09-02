import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

function tokenPath(): string {
  return join(app.getPath('userData'), 'token.bin')
}

export function saveToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Keychain isn't available, so the token can't be saved")
  }
  writeFileSync(tokenPath(), safeStorage.encryptString(token))
}

export function loadToken(): string | null {
  let encrypted: Buffer
  try {
    encrypted = readFileSync(tokenPath())
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
    // The Keychain couldn't decrypt this file — e.g. it was written under a
    // different user or the OS keychain entry is gone. Distinguishing this
    // from "no token yet" matters: silently returning null here would leave
    // an unusable file behind forever, so the next sign-in would keep
    // tripping over it. Log it and clear the file so sign-in starts clean.
    console.error('[token-storage] failed to decrypt the stored token; clearing it', error)
    clearToken()
    return null
  }
}

export function clearToken(): void {
  rmSync(tokenPath(), { force: true })
}
