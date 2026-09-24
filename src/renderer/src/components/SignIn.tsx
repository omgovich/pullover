import type { DeviceCodePayload } from '@shared/ipc'
import { ExternalLink, LogIn } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button, Text, View } from 'reshaped/bundle'
import { useSettings } from '../useSettings'

const GITLAB_TOKEN_DOCS = 'https://docs.gitlab.com/user/profile/personal_access_tokens/'
const GITHUB_OAUTH_DOCS =
  'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app'

export default function SignIn(): React.JSX.Element {
  const settings = useSettings()
  const [provider, setProvider] = useState<'github' | 'gitlab' | null>(null)
  const [serverUrl, setServerUrl] = useState('https://gitlab.com')
  const [token, setToken] = useState('')
  const [githubDeviceFlow, setGithubDeviceFlow] = useState<boolean | null>(null)
  const [code, setCode] = useState<DeviceCodePayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const providerRef = useRef<'github' | 'gitlab' | null>(null)
  const urlEditedRef = useRef(false)
  const flowIdRef = useRef(0)
  const githubFlowPendingRef = useRef(false)

  useEffect(
    () =>
      window.api.onDeviceCode((payload) => {
        if (providerRef.current !== 'github' || !githubFlowPendingRef.current) return
        setCode(payload)
      }),
    [],
  )
  useEffect(() => {
    if (settings?.gitlabUrl && !urlEditedRef.current) setServerUrl(settings.gitlabUrl)
    if (settings?.provider === 'gitlab' && providerRef.current === null) {
      providerRef.current = 'gitlab'
      setProvider('gitlab')
    }
  }, [settings?.gitlabUrl, settings?.provider])

  useEffect(() => {
    void window.api.canUseGitHubDeviceFlow().then(setGithubDeviceFlow)
  }, [])

  const chooseProvider = async (next: 'github' | 'gitlab'): Promise<void> => {
    flowIdRef.current += 1
    githubFlowPendingRef.current = false
    providerRef.current = next
    setProvider(next)
    setCode(null)
    setError(null)
    setBusy(false)
    try {
      await window.api.switchProvider(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const startGitHub = async (): Promise<void> => {
    const flowId = ++flowIdRef.current
    githubFlowPendingRef.current = true
    setBusy(true)
    setError(null)
    try {
      await window.api.startAuth()
    } catch (cause) {
      if (flowId === flowIdRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
        setCode(null)
      }
    } finally {
      if (flowId === flowIdRef.current) {
        githubFlowPendingRef.current = false
        setBusy(false)
      }
    }
  }

  const startGitLab = async (): Promise<void> => {
    const flowId = ++flowIdRef.current
    setBusy(true)
    setError(null)
    try {
      await window.api.connectGitLab(serverUrl, token)
      if (flowId === flowIdRef.current) setToken('')
    } catch (cause) {
      if (flowId === flowIdRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      if (flowId === flowIdRef.current) setBusy(false)
    }
  }

  const back = (): void => {
    flowIdRef.current += 1
    githubFlowPendingRef.current = false
    providerRef.current = null
    setProvider(null)
    setCode(null)
    setToken('')
    setError(null)
    setBusy(false)
    void window.api.cancelAuth()
  }

  return (
    <View padding={6} gap={4} align="center" justify="center" height="100%" minHeight={0}>
      <Text variant="featured-3" weight="bold">
        Pullover
      </Text>

      {provider === null && (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Connect your code hosting account to see what needs you.
          </Text>
          <Button color="primary" onClick={() => void chooseProvider('gitlab')}>
            GitLab
          </Button>
          <Button variant="outline" onClick={() => void chooseProvider('github')}>
            GitHub
          </Button>
        </>
      )}

      {provider === 'gitlab' && (
        <>
          <Text variant="body-2" color="neutral-faded" align="center">
            Enter your GitLab server and a personal access token from the account whose MRs you want
            to see. It needs read_api scope; group tokens use a separate bot account.
          </Text>
          <Button
            size="small"
            variant="ghost"
            icon={ExternalLink}
            onClick={() => void window.api.openPr(GITLAB_TOKEN_DOCS)}
          >
            How to create a personal token
          </Button>
          <input
            className="pv-auth-input"
            aria-label="GitLab server URL"
            type="url"
            value={serverUrl}
            onChange={(event) => {
              urlEditedRef.current = true
              setServerUrl(event.target.value)
            }}
            placeholder="https://gitlab.example.com"
          />
          <input
            className="pv-auth-input"
            aria-label="GitLab access token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Personal access token"
          />
          <Button
            color="primary"
            icon={LogIn}
            loading={busy}
            disabled={!serverUrl || !token}
            onClick={() => void startGitLab()}
          >
            Connect GitLab
          </Button>
          <Button variant="ghost" onClick={back}>
            Back
          </Button>
        </>
      )}

      {provider === 'github' &&
        (code === null ? (
          <>
            <Text variant="body-2" color="neutral-faded" align="center">
              Sign in with GitHub to see what needs you.
            </Text>
            <Button
              color="primary"
              icon={LogIn}
              loading={busy}
              disabled={githubDeviceFlow !== true}
              onClick={() => void startGitHub()}
            >
              Sign in with GitHub
            </Button>
            {githubDeviceFlow === false && (
              <>
                <Text variant="caption-1" color="neutral-faded" align="center">
                  This build needs a GitHub OAuth Client ID to sign in.
                </Text>
                <Button
                  size="small"
                  variant="ghost"
                  icon={ExternalLink}
                  onClick={() => void window.api.openPr(GITHUB_OAUTH_DOCS)}
                >
                  How to set up GitHub OAuth
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
          </>
        ) : (
          <>
            <Text variant="body-2" color="neutral-faded" align="center">
              Enter this code at {code.verificationUri} — it's already on your clipboard.
            </Text>
            <Text variant="featured-2" weight="bold" monospace>
              {code.userCode}
            </Text>
            <Text variant="caption-1" color="neutral-faded">
              Waiting for you to approve…
            </Text>
            <Button variant="ghost" onClick={back}>
              Back
            </Button>
          </>
        ))}

      {error !== null && (
        <Text variant="caption-1" color="critical" align="center">
          {error}
        </Text>
      )}
    </View>
  )
}
