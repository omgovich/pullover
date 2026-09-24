// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Pullover",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "Pullover", targets: ["Pullover"]),
    ],
    targets: [
        // Pure classification logic: no I/O, no clock, no AppKit.
        .target(name: "PulloverCore"),
        // GitHub, auth, persistence, the inbox engine and the MCP server.
        .target(name: "PulloverKit", dependencies: ["PulloverCore"]),
        // The menu-bar app: AppKit shell around SwiftUI views.
        .executableTarget(name: "Pullover", dependencies: ["PulloverCore", "PulloverKit"]),
        .testTarget(name: "PulloverCoreTests", dependencies: ["PulloverCore"]),
        .testTarget(name: "PulloverKitTests", dependencies: ["PulloverKit", "PulloverCore"]),
    ]
)
