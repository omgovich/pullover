import Foundation
import PulloverCore
import Testing
@testable import PulloverKit

private let NOW = d("2026-08-10T12:00:00Z")

@Suite struct AppStoreSettingsTests {
    let defaults = TestDefaults()
    var store: AppStore { defaults.makeStore() }

    /// A store over settings some earlier build wrote.
    private func stored(_ json: String) -> AppStore {
        defaults.writeSettings(json)
        return defaults.makeStore()
    }

    @Test func startsWithAFiveMinutePollInterval() {
        #expect(store.settings.pollIntervalMinutes == 5)
    }

    @Test func appliesAPartialUpdate() {
        store.updateSettings { $0.pollIntervalMinutes = 15 }
        #expect(store.settings.pollIntervalMinutes == 15)
        #expect(store.settings.repositories.isEmpty)
    }

    @Test func defaultsToWatchingEveryRepo() {
        #expect(store.settings.watchAllRepositories)
    }

    @Test func defaultsToFollowingTheSystemTheme() {
        #expect(store.settings.theme == .system)
    }

    @Test func keepsTheMCPServerOffUntilAsked() {
        #expect(!store.settings.mcpServerEnabled)
    }

    @Test func persistsTurningTheMCPServerOn() {
        store.updateSettings { $0.mcpServerEnabled = true }
        #expect(defaults.makeStore().settings.mcpServerEnabled)
    }

    @Test func normalisesAPreExistingSettingsFileMissingThemeToSystem() {
        let store = stored(#"{"pollIntervalMinutes":5,"repositories":[],"watchAllRepositories":true}"#)
        #expect(store.settings.theme == .system)
    }

    @Test func normalisesAPreExistingSettingsFileMissingWatchAllRepositoriesToTrue() {
        let store = stored(#"{"pollIntervalMinutes":5,"repositories":[]}"#)
        #expect(store.settings.watchAllRepositories)
    }

    @Test func preservesAnExplicitFalseRatherThanResurrectingItToTrue() {
        let store = stored("""
        {"pollIntervalMinutes":5,"repositories":["acme/web"],"watchAllRepositories":false,"theme":"system",
         "globalShortcut":"Control+Alt+P","layout":"comfortable","mcpServerEnabled":false}
        """)
        #expect(!store.settings.watchAllRepositories)
    }

    @Test func preservesOtherOnDiskFieldsInsteadOfClobberingThemWithDefaults() {
        let store = stored(#"{"pollIntervalMinutes":42,"repositories":["acme/web","acme/api"]}"#)
        #expect(store.settings == Settings(
            pollIntervalMinutes: 42,
            repositories: ["acme/web", "acme/api"],
            watchAllRepositories: true,
            theme: .system,
            globalShortcut: .controlOptionP,
            layout: .comfortable,
            mcpServerEnabled: false
        ))
    }

    @Test func replacesAShortcutThisBuildNoLongerOffers() {
        #expect(stored(#"{"globalShortcut":"Alt+Space"}"#).settings.globalShortcut == Settings.defaults.globalShortcut)
    }

    @Test func keepsAShortcutThatIsStillOffered() {
        #expect(stored(#"{"globalShortcut":"Control+Alt+R"}"#).settings.globalShortcut == .controlOptionR)
    }

    // Off is a real choice, not an unknown value to be corrected.
    @Test func leavesAnExplicitlyDisabledShortcutDisabled() {
        #expect(stored(#"{"globalShortcut":null}"#).settings.globalShortcut == nil)
    }

    @Test func keepsADisabledShortcutThroughASaveAndLoad() {
        store.updateSettings { $0.globalShortcut = nil }
        #expect(defaults.makeStore().settings.globalShortcut == nil)
    }

    @Test func replacesALayoutThisBuildNoLongerOffers() {
        #expect(stored(#"{"layout":"cosy"}"#).settings.layout == Settings.defaults.layout)
    }

    @Test func keepsALayoutThatIsStillOffered() {
        #expect(stored(#"{"layout":"compact"}"#).settings.layout == .compact)
    }

    @Test func roundTripsAPartialUpdateThroughTheNormalisedSettings() {
        let store = stored(#"{"pollIntervalMinutes":5,"repositories":[]}"#)
        store.updateSettings { $0.watchAllRepositories = false }
        #expect(!store.settings.watchAllRepositories)
    }

    @Test func keepsTheRestWhenOneFieldHasTheWrongType() {
        let store = stored(#"{"pollIntervalMinutes":"often","repositories":["acme/web"],"theme":"dark"}"#)
        #expect(store.settings.pollIntervalMinutes == 5)
        #expect(store.settings.repositories == ["acme/web"])
        #expect(store.settings.theme == .dark)
    }

    @Test func replacesAPollIntervalThatIsNotPositive() {
        #expect(stored(#"{"pollIntervalMinutes":0}"#).settings.pollIntervalMinutes == 5)
    }

    // Inbox.start multiplies by 60; Int.max would trap there.
    @Test(arguments: [Int.max, 1441, -1])
    func replacesAPollIntervalOutsideAMinuteToADay(minutes: Int) {
        #expect(stored(#"{"pollIntervalMinutes":\#(minutes)}"#).settings.pollIntervalMinutes == 5)
    }

    @Test(arguments: [1, 1440])
    func keepsAPollIntervalAtEitherEndOfTheRange(minutes: Int) {
        #expect(stored(#"{"pollIntervalMinutes":\#(minutes)}"#).settings.pollIntervalMinutes == minutes)
    }

    @Test func fallsBackToTheDefaultsWhenTheStoredSettingsAreNotJSON() {
        #expect(stored("not json").settings == .defaults)
    }
}

@Suite struct AppStoreRepositoryTests {
    let defaults = TestDefaults()
    var store: AppStore { defaults.makeStore() }

    @Test func addsARepository() throws {
        try store.addRepository("acme/web")
        #expect(store.settings.repositories == ["acme/web"])
    }

    @Test func ignoresADuplicate() throws {
        try store.addRepository("acme/web")
        try store.addRepository("acme/web")
        #expect(store.settings.repositories == ["acme/web"])
    }

    @Test func normalisesCaseAndSurroundingWhitespace() throws {
        try store.addRepository("  ACME/Web  ")
        #expect(store.settings.repositories == ["acme/web"])
    }

    @Test(arguments: ["acme", "acme/web/extra", "acme/", "/web", ""])
    func rejectsAValueThatIsNotOwnerSlashRepo(input: String) {
        let error = #expect(throws: InvalidRepositoryError.self) { try store.addRepository(input) }
        #expect(error?.localizedDescription.contains("owner/repo") == true)
        #expect(store.settings.repositories.isEmpty)
    }

    @Test func acceptsOwnerRepoNamesWithDotsHyphensAndUnderscores() throws {
        try store.addRepository("acme-co/my_repo.js")
        #expect(store.settings.repositories == ["acme-co/my_repo.js"])
    }

    @Test func removesARepository() throws {
        try store.addRepository("acme/web")
        try store.addRepository("acme/api")
        store.removeRepository("acme/web")
        #expect(store.settings.repositories == ["acme/api"])
    }

    @Test func removesARepositorySavedInMixedCaseByAnOlderBuild() {
        store.updateSettings { $0.repositories = ["Acme/Web", "acme/api"] }
        store.removeRepository("acme/web")
        #expect(store.settings.repositories == ["acme/api"])
    }
}

@Suite struct AppStoreSnoozeTests {
    let defaults = TestDefaults()
    var store: AppStore { defaults.makeStore() }

    @Test func recordsATimedSnoozeWithADeadline() {
        store.snooze("PR_1", type: .untilTime, now: NOW, hours: 3)
        let snooze = store.snoozes["PR_1"]
        #expect(snooze?.type == .untilTime)
        #expect(snooze?.snoozedAt == NOW)
        #expect(snooze?.until == d("2026-08-10T15:00:00Z"))
    }

    @Test func recordsAConditionalSnoozeWithNoDeadline() {
        store.snooze("PR_1", type: .untilActivity, now: NOW)
        let snooze = store.snoozes["PR_1"]
        #expect(snooze?.type == .untilActivity)
        #expect(snooze != nil && snooze?.until == nil)
    }

    @Test func recordsTheHeadASnoozeWasSetOn() {
        store.snooze("PR_1", type: .untilActivity, now: NOW, headSHA: "abc123")
        #expect(store.snoozes["PR_1"]?.headSHA == "abc123")
    }

    @Test func ignoresHoursForAConditionalSnooze() {
        store.snooze("PR_1", type: .untilActivity, now: NOW, hours: 3)
        #expect(store.snoozes["PR_1"]?.until == nil)
    }

    // "requires hours for a timed snooze": the Swift `snooze` does not throw;
    // a timed snooze without hours falls back to 24.

    // Whole-second persistence would read `until` back up to a second early.
    @Test func keepsFractionalSecondsThroughASaveAndLoad() {
        let now = NOW.addingTimeInterval(0.25)
        store.snooze("PR_1", type: .untilTime, now: now, hours: 3)
        let snooze = defaults.makeStore().snoozes["PR_1"]
        #expect(snooze?.snoozedAt == now)
        #expect(snooze?.until == now.addingTimeInterval(3 * 3600))
    }

    @Test func removesASnooze() {
        store.snooze("PR_1", type: .untilActivity, now: NOW)
        store.unsnooze("PR_1")
        #expect(store.snoozes["PR_1"] == nil)
    }

    @Test func keepsSnoozesAcrossStoresOverTheSameDefaults() {
        store.snooze("PR_1", type: .untilTime, now: NOW, hours: 3)
        store.snooze("PR_2", type: .untilActivity, now: NOW)
        #expect(defaults.makeStore().snoozes == [
            "PR_1": Snooze(prId: "PR_1", type: .untilTime, snoozedAt: NOW, until: d("2026-08-10T15:00:00Z")),
            "PR_2": Snooze(prId: "PR_2", type: .untilActivity, snoozedAt: NOW),
        ])
    }
}

/// Read-modify-writes from many threads at once must not lose each other's changes.
@Suite struct AppStoreConcurrencyTests {
    let defaults = TestDefaults()
    private let count = 200

    @Test func keepsEveryRepositoryAddedConcurrently() throws {
        let store = defaults.makeStore()
        DispatchQueue.concurrentPerform(iterations: count) { i in
            try? store.addRepository("acme/repo-\(i)")
        }
        #expect(Set(store.settings.repositories) == Set((0..<count).map { "acme/repo-\($0)" }))
    }

    @Test func keepsEveryUpdateAppliedConcurrently() {
        let store = defaults.makeStore()
        DispatchQueue.concurrentPerform(iterations: count) { i in
            store.updateSettings { $0.repositories.append("acme/repo-\(i)") }
        }
        #expect(store.settings.repositories.count == count)
    }

    @Test func removesEveryRepositoryRemovedConcurrently() throws {
        let store = defaults.makeStore()
        store.updateSettings { $0.repositories = (0..<count).map { "acme/repo-\($0)" } }
        DispatchQueue.concurrentPerform(iterations: count) { i in
            store.removeRepository("acme/repo-\(i)")
        }
        #expect(store.settings.repositories.isEmpty)
    }

    @Test func keepsEverySnoozeRecordedConcurrently() {
        let store = defaults.makeStore()
        DispatchQueue.concurrentPerform(iterations: count) { i in
            store.snooze("PR_\(i)", type: .untilActivity, now: NOW)
        }
        #expect(store.snoozes.count == count)
    }

    @Test func dropsEverySnoozeRemovedConcurrently() {
        let store = defaults.makeStore()
        for i in 0..<count { store.snooze("PR_\(i)", type: .untilActivity, now: NOW) }
        DispatchQueue.concurrentPerform(iterations: count) { i in
            store.unsnooze("PR_\(i)")
        }
        #expect(store.snoozes.isEmpty)
    }
}
