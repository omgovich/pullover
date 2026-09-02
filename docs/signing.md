# Signing and notarizing Pullover

Releases are signed with a Developer ID Application certificate and notarized by Apple, so macOS opens the app without the "cannot be opened because it is from an unidentified developer" warning. Everything happens in CI — but the credentials have to be created by hand once, in Apple's portals, and stored as GitHub repository secrets.

This is a one-time setup. Once the five secrets below exist, every `v*` tag produces a signed, notarized dmg.

## 1. Developer ID Application certificate

This is the certificate that signs the app. It is not the same as the "Apple Development" certificate Xcode creates for you automatically, and it can only be issued by the Account Holder of the Apple Developer account.

With Xcode installed, the short path:

1. Xcode → Settings → Accounts, sign in with the Apple ID that holds the developer membership.
2. Select the team → Manage Certificates… → **+** → **Developer ID Application**.

Without Xcode, do it in the portal at developer.apple.com → Certificates, Identifiers & Profiles → Certificates → **+** → **Developer ID Application**, which will ask for a Certificate Signing Request that you generate in Keychain Access (Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority, saved to disk).

Either way you end up with the certificate in your login keychain. Export it:

1. Keychain Access → My Certificates → find **Developer ID Application: … (TEAMID)**.
2. Right-click → Export… → format **Personal Information Exchange (.p12)**.
3. Give it a password. You will need that password in a moment — this is `CSC_KEY_PASSWORD`.

Then turn the file into the base64 blob CI expects:

```bash
base64 -i Certificates.p12 | pbcopy
```

That clipboard content is `CSC_LINK`.

Expand the triangle next to the certificate in Keychain Access before exporting and make sure the **private key** is included — a .p12 without it will fail signing with a confusing error.

## 2. App Store Connect API key

This is what notarization authenticates with. We use an API key rather than an Apple ID plus app-specific password: the key is scoped, individually revocable, and not tied to a personal Apple ID login. electron-builder recommends the same.

1. Go to appstoreconnect.apple.com → **Users and Access** → **Integrations** (labelled **Keys** in older versions of the UI) → **App Store Connect API** → **Team Keys**.
2. **+**, name it something like `pullover-notarization`, give it the **Developer** role.
3. Download the `.p8` file. **Apple lets you download it exactly once** — if you lose it, revoke the key and make a new one.
4. From the same page note the **Key ID** (short, like `T9GPZ92M7K`) and the **Issuer ID** (a UUID, shown above the key list).

That gives three values:

- the contents of the `.p8` file → `APPLE_API_KEY_CONTENT`
- the Key ID → `APPLE_API_KEY_ID`
- the Issuer ID → `APPLE_API_ISSUER`

Paste the `.p8` **verbatim**, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. `pbcopy < AuthKey_XXXXXXXX.p8` is the safe way to get it.

No Team ID secret is needed: the API key already identifies the team.

## 3. Keep the originals

GitHub secrets are write-only: once stored they can be replaced but never read back, so the repository is not a copy of anything. If these files exist nowhere else, they are gone. Keep them in a password manager — one item, with the files attached rather than pasted as text:

| Keep | Why |
| --- | --- |
| `Certificates.p12` (secret) | The certificate and its private key. |
| Its export password (secret) | Useless without the file, and the file is useless without it. |
| `AuthKey_….p8` (secret) | The one file Apple will not give you twice. |
| Key ID | Not sensitive, but needed beside the key to use it. |
| Issuer ID | Same — also visible in App Store Connect. |
| Team ID | The code in `Developer ID Application: … (TEAMID)`. |

Worth noting alongside them: the certificate expires five years from issue, and Apple caps how many Developer ID certificates an account may hold, so they are not something to re-create casually.

Losing them is not equally bad. The `.p8` is unrecoverable — revoke the key and make another. The `.p12` is merely painful: a fresh certificate can be issued within the same team, and because Gatekeeper and the updater key on the team rather than the individual certificate, released builds keep working.

None of this belongs in the repository, a note app, or a chat window.

## 4. Add the secrets to GitHub

github.com/omgovich/pullover → Settings → Secrets and variables → Actions → Secrets → New repository secret, five times:

| Secret | Value |
| --- | --- |
| `CSC_LINK` | base64 of the `.p12` |
| `CSC_KEY_PASSWORD` | the password the `.p12` was exported with |
| `APPLE_API_KEY_CONTENT` | contents of the `.p8`, verbatim |
| `APPLE_API_KEY_ID` | the key's ID |
| `APPLE_API_ISSUER` | the issuer UUID |

`ANTHROPIC_API_KEY` (release notes) and the `PULLOVER_GITHUB_CLIENT_ID` variable are already configured from earlier work.

## How the workflow uses them

`electron-builder.yml` turns on `hardenedRuntime`, the entitlements in `build/entitlements.mac.plist`, and `notarize: true`. The release workflow then:

1. **Checks all five secrets are present before building.** This guard matters: when notarization credentials are missing, electron-builder logs a warning and continues, producing a signed but *un-notarized* dmg. Without the check, a forgotten secret would ship a build that Gatekeeper still blocks, and nothing in the log would look like a failure.
2. **Writes `APPLE_API_KEY_CONTENT` to a file** under the runner's temp directory. `@electron/notarize` expects `APPLE_API_KEY` to be a *filesystem path* to the `.p8`, not its contents.
3. Builds, signs, notarizes and staples in one `electron-builder` invocation.
4. **Verifies the result** with `stapler validate`, `codesign --verify --deep --strict` and `spctl --assess`, so the release fails if the artifact is not genuinely notarized.

Note that electron-builder checks `APPLE_ID` before the API key. If an `APPLE_ID` secret is ever added, it will take precedence and the API key will be ignored.

## Verifying a release by hand

After the first signed release, download the dmg from GitHub — through a browser, so it carries the quarantine attribute a real user's download would — and check:

```bash
spctl --assess --type open --context context:primary-signature -vv ~/Downloads/Pullover-0.3.0.dmg
```

`source=Notarized Developer ID` is the answer you want. Opening the app should produce no Gatekeeper warning at all.

## A note on the bundle ID

The app's bundle ID is `ru.omgovich.pullover`. It changed from `net.variant.pullover` — an employer's domain that had no business in a personal open-source project — when signing was set up.

Changing it has one user-visible consequence: macOS derives the app's data directory from the bundle ID, so anyone upgrading across that change starts with empty settings and gets signed out, because the stored token lives under the old identifier. At this point that is only ever the maintainer. It must not change again once the app has real users — the bundle ID is also what ties auto-update continuity together.

## Next: auto-update

Not done yet. When it lands it needs, roughly:

- `electron-updater` as a dependency, and updater wiring in the main process.
- `zip` added to the mac targets. macOS updates are delivered as a zip, not a dmg — `app-builder-lib` only writes the `latest-mac.yml` feed from a zip artifact — so a dmg-only release cannot auto-update.
- `dmg.writeUpdateInfo` flipped back to `true`, which is what generates that feed and the `.blockmap`.

Signing is a prerequisite rather than a nicety: macOS refuses to swap in an update whose signature does not match the running app.
