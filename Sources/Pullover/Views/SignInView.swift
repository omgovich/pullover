import SwiftUI

struct SignInView: View {
    var model: AppModel

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "arrow.triangle.pull")
                .font(.system(size: 34, weight: .medium))
                .foregroundStyle(.blue)
            Text("Pullover")
                .font(.system(size: 20, weight: .bold))

            switch model.signIn {
            case .idle, .requesting:
                Text("Sign in with GitHub to see what needs you.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Button {
                    model.startSignIn()
                } label: {
                    HStack(spacing: 6) {
                        if model.signIn == .requesting {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "person.crop.circle.badge.checkmark")
                        }
                        Text("Sign in with GitHub")
                    }
                    .padding(.horizontal, 6)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(model.signIn == .requesting)
            case let .waitingForApproval(code):
                Text(verbatim: "Enter this code at \(code.verificationURI) — it's already on your clipboard.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                // Selectable: there is no copy button, and the clipboard may
                // have moved on by the time the browser asks for it.
                Text(code.userCode)
                    .font(.system(size: 26, weight: .bold, design: .monospaced))
                    .textSelection(.enabled)
                HStack(spacing: 6) {
                    ProgressView().controlSize(.small)
                    Text("Waiting for you to approve…")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // Signed out in the app, but the token may still be in the Keychain
            // and would sign the next launch back in.
            if let error = model.signOutError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
            if let error = model.signInError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .multilineTextAlignment(.center)
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
