import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearToken, loadToken } from './token-storage'

// `vi.mock` factories are hoisted above every import in this file, so their
// fakes must come from `vi.hoisted` rather than plain top-level `const`s —
// otherwise the factory below would run before those consts are initialised.
const { readFileSync, writeFileSync, rmSync, isEncryptionAvailable, encryptString, decryptString } =
  vi.hoisted(() => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    rmSync: vi.fn(),
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  }))

vi.mock('node:fs', () => ({ readFileSync, writeFileSync, rmSync }))
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/pullover-test' },
  safeStorage: { isEncryptionAvailable, encryptString, decryptString },
}))

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  isEncryptionAvailable.mockReturnValue(true)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('loadToken', () => {
  it('returns null silently when there is no token file yet (the normal first-run/signed-out path)', () => {
    const notFound = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    readFileSync.mockImplementation(() => {
      throw notFound
    })

    expect(loadToken()).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('logs, but does not clear the file, when reading it fails for a reason other than "missing"', () => {
    const denied = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    readFileSync.mockImplementation(() => {
      throw denied
    })

    expect(loadToken()).toBeNull()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(rmSync).not.toHaveBeenCalled()
  })

  it('returns the decrypted token when the file reads and decrypts cleanly', () => {
    readFileSync.mockReturnValue(Buffer.from('encrypted'))
    decryptString.mockReturnValue('gho_abc123')

    expect(loadToken()).toBe('gho_abc123')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('logs and clears the file when the Keychain cannot decrypt it, so the next sign-in starts clean', () => {
    readFileSync.mockReturnValue(Buffer.from('corrupt'))
    decryptString.mockImplementation(() => {
      throw new Error('decryption failed')
    })

    expect(loadToken()).toBeNull()
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(rmSync).toHaveBeenCalledTimes(1)
  })
})

describe('clearToken', () => {
  it('removes the token file without throwing when it does not exist', () => {
    expect(() => clearToken()).not.toThrow()
    expect(rmSync).toHaveBeenCalledWith(expect.stringContaining('token.bin'), { force: true })
  })
})
