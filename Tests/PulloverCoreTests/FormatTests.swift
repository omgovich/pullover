import Testing
@testable import PulloverCore

private let now = d("2026-08-10T12:00:00Z")

@Suite struct FormatTests {
    @Suite("formatAge") struct FormatAge {
        @Test("reports minutes under an hour") func minutes() {
            #expect(formatAge(d("2026-08-10T11:30:00Z"), now: now) == "30m ago")
        }

        @Test("reports \"just now\" under a minute") func justNow() {
            #expect(formatAge(d("2026-08-10T11:59:30Z"), now: now) == "just now")
        }

        @Test("reports hours under a day") func hours() {
            #expect(formatAge(d("2026-08-10T09:00:00Z"), now: now) == "3h ago")
        }

        @Test("reports days beyond a day") func days() {
            #expect(formatAge(d("2026-08-05T12:00:00Z"), now: now) == "5d ago")
        }

        @Test("clamps a future timestamp to \"just now\"") func future() {
            #expect(formatAge(d("2026-08-10T13:00:00Z"), now: now) == "just now")
        }

        @Test("pins minute boundary at exactly 60 seconds") func minuteBoundary() {
            #expect(formatAge(d("2026-08-10T11:59:00Z"), now: now) == "1m ago")
        }

        @Test("pins hour boundary at exactly 3600 seconds") func hourBoundary() {
            #expect(formatAge(d("2026-08-10T11:00:00Z"), now: now) == "1h ago")
        }

        @Test("pins day boundary at exactly 86400 seconds") func dayBoundary() {
            #expect(formatAge(d("2026-08-09T12:00:00Z"), now: now) == "1d ago")
        }
    }

    @Suite("formatWaiting") struct FormatWaiting {
        @Test("reports minutes under an hour") func minutes() {
            #expect(formatWaiting(d("2026-08-10T11:30:00Z"), now: now) == "waiting 30m")
        }

        @Test("reports hours under a day") func hours() {
            #expect(formatWaiting(d("2026-08-10T09:00:00Z"), now: now) == "waiting 3h")
        }

        @Test("reports days beyond a day") func days() {
            #expect(formatWaiting(d("2026-08-05T12:00:00Z"), now: now) == "waiting 5d")
        }

        @Test("reports \"<1m\" under a minute rather than \"0m\"") func underAMinute() {
            #expect(formatWaiting(d("2026-08-10T11:59:30Z"), now: now) == "waiting <1m")
        }

        @Test("clamps a future timestamp the same way") func future() {
            #expect(formatWaiting(d("2026-08-10T13:00:00Z"), now: now) == "waiting <1m")
        }

        @Test("shares formatAge's boundaries") func boundaries() {
            #expect(formatWaiting(d("2026-08-10T11:59:00Z"), now: now) == "waiting 1m")
            #expect(formatWaiting(d("2026-08-10T11:00:00Z"), now: now) == "waiting 1h")
            #expect(formatWaiting(d("2026-08-09T12:00:00Z"), now: now) == "waiting 1d")
        }
    }

    @Suite("formatWait") struct FormatWait {
        @Test("reports minutes, rounded up, under an hour") func minutes() {
            #expect(formatWait(until: d("2026-08-10T12:12:00Z"), now: now) == "12 minutes")
        }

        @Test("rounds a partial minute up rather than down") func roundsUp() {
            #expect(formatWait(until: d("2026-08-10T12:12:01Z"), now: now) == "13 minutes")
        }

        @Test("reports \"a minute\" at or under one minute") func aMinute() {
            #expect(formatWait(until: d("2026-08-10T12:00:30Z"), now: now) == "a minute")
            #expect(formatWait(until: d("2026-08-10T12:01:00Z"), now: now) == "a minute")
        }

        @Test("reports \"1 hour\" for exactly one hour") func oneHour() {
            #expect(formatWait(until: d("2026-08-10T13:00:00Z"), now: now) == "1 hour")
        }

        @Test("reports hours, rounded up, beyond an hour") func hours() {
            #expect(formatWait(until: d("2026-08-10T13:30:00Z"), now: now) == "2 hours")
        }

        @Test("pins the minute boundary just past 60 seconds") func minuteBoundary() {
            #expect(formatWait(until: d("2026-08-10T12:01:01Z"), now: now) == "2 minutes")
        }
    }

    @Suite("repositoryName") struct RepositoryName {
        @Test("drops the owner") func dropsOwner() {
            #expect(repositoryName("mozilla/pdf.js") == "pdf.js")
            #expect(repositoryName("omgovich/pullover") == "pullover")
        }

        @Test("leaves a bare name alone") func bareName() {
            #expect(repositoryName("pullover") == "pullover")
        }

        @Test("keeps the last segment when there are extra slashes") func extraSlashes() {
            #expect(repositoryName("enterprise/team/repo") == "repo")
        }

        @Test("survives the degenerate shapes rather than throwing") func degenerate() {
            #expect(repositoryName("") == "")
            #expect(repositoryName("owner/") == "")
        }
    }
}
