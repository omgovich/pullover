import Foundation
import Testing
@testable import PulloverKit

private let NOW = d("2026-08-10T12:00:00Z")

private let badGatewayPage = """
<html>
<head><title>502 Bad Gateway</title></head>
<body>
<center><h1>502 Bad Gateway</h1></center>
<hr><center>nginx</center>
</body>
</html>

"""

private let unrelatedGraphQLError = graphqlError(["Field \"bogus\" does not exist"], data: nil)

@Suite struct RateLimitResetAtTests {
    @Test func readsThePrimaryLimitFromA403WithRemainingExhaustedAndAUnixResetTimestamp() {
        let error = httpError(403, "API rate limit exceeded", headers: [
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1786363920",
        ])
        #expect(rateLimitResetAt(error, now: NOW) == d("2026-08-10T12:12:00Z"))
    }

    @Test func readsTheSecondaryLimitFromA429WithRetryAfterSeconds() {
        let error = httpError(429, "You have exceeded a secondary rate limit", headers: ["retry-after": "90"])
        #expect(rateLimitResetAt(error, now: NOW) == d("2026-08-10T12:01:30Z"))
    }

    @Test func readsTheSecondaryLimitFromA403WithRetryAfterSeconds() {
        let error = httpError(403, "You have exceeded a secondary rate limit", headers: ["retry-after": "30"])
        #expect(rateLimitResetAt(error, now: NOW) == d("2026-08-10T12:00:30Z"))
    }

    @Test func doesNotMatchA403WithNoRateLimitHeadersAtAll() {
        #expect(rateLimitResetAt(httpError(403, "Forbidden"), now: NOW) == nil)
    }

    @Test func doesNotMatchA403ThatIsAPermissionProblemNotAnExhaustedLimit() {
        let error = httpError(403, "Resource not accessible by integration", headers: [
            "x-ratelimit-limit": "5000",
            "x-ratelimit-remaining": "4999",
            "x-ratelimit-reset": "1786363920",
        ])
        #expect(rateLimitResetAt(error, now: NOW) == nil)
    }

    @Test func doesNotMatchA401() {
        let error = httpError(401, "Bad credentials", headers: ["x-ratelimit-remaining": "0", "x-ratelimit-reset": "1786363920"])
        #expect(rateLimitResetAt(error, now: NOW) == nil)
    }

    @Test func doesNotMatchA401CarryingARetryAfterHeaderEither() {
        #expect(rateLimitResetAt(httpError(401, "Bad credentials", headers: ["retry-after": "30"]), now: NOW) == nil)
    }

    @Test func doesNotMatchA404() {
        let error = httpError(404, "Not Found", headers: ["x-ratelimit-remaining": "0", "x-ratelimit-reset": "1786363920"])
        #expect(rateLimitResetAt(error, now: NOW) == nil)
    }

    @Test func doesNotMatchAGraphQLErrorWhichCarriesNoStatus() {
        #expect(rateLimitResetAt(unrelatedGraphQLError, now: NOW) == nil)
    }

    @Test func doesNotMatchAnErrorThatIsNotFromGitHub() {
        #expect(rateLimitResetAt(TestError("network down"), now: NOW) == nil)
        #expect(rateLimitResetAt(GitHubError.network("network down"), now: NOW) == nil)
    }

    // "does not match a non-Error value": Swift only throws `Error`s.
}

@Suite struct DescribeErrorTests {
    @Test func replacesAnHTMLErrorPageWithTheStatusItArrivedUnder() {
        #expect(describeError(httpError(502, badGatewayPage)) == "Couldn't reach GitHub — HTTP 502")
    }

    @Test func replacesABodyThatOpensLikeJSONRatherThanASentence() {
        let error = httpError(503, #"{"errors":[{"type":"SERVICE_UNAVAILABLE"}]}"#)
        #expect(describeError(error) == "Couldn't reach GitHub — HTTP 503")
    }

    @Test func keepsALongSentenceCutToWhatTheHeaderCanShow() {
        let timeout = httpError(
            502,
            "We couldn't respond to your request in time. Sorry about that. Please try resubmitting your request and contact us if the problem persists."
        )
        #expect(describeError(timeout)
            == "We couldn't respond to your request in time. Sorry about that. Please try resubmitting your request and contact us if…")
    }

    @Test func keepsGitHubsOwnMessageWhichIsShortAndWrittenForAHuman() {
        #expect(describeError(httpError(401, "Bad credentials")) == "Bad credentials")
    }

    @Test func keepsAGraphQLErrorWhichArrivesUnderA200() {
        // Swift keeps GitHub's words as they are; octokit prefixed them with its own.
        #expect(describeError(graphqlError(["Could not resolve to a node"], data: nil)) == "Could not resolve to a node")
        #expect(describeError(graphqlError(["One", "Two"], data: nil)) == "One; Two")
    }

    @Test func keepsANetworkFailureMessage() {
        #expect(describeError(GitHubError.network("getaddrinfo ENOTFOUND api.github.com")) == "getaddrinfo ENOTFOUND api.github.com")
    }

    @Test func collapsesTheWhitespaceOfAMessageWorthKeeping() {
        #expect(describeError(TestError("Something\n  went   wrong")) == "Something went wrong")
    }

    @Test func fallsBackWithoutAStatusWhenThereIsNothingReadableAndNothingThrownByHTTP() {
        #expect(describeError(TestError("")) == "Couldn't reach GitHub")
        #expect(describeError(TestError(badGatewayPage)) == "Couldn't reach GitHub")
        #expect(describeError(GitHubError.network("")) == "Couldn't reach GitHub")
    }

    @Test func isWhatAGitHubErrorReportsAsItsLocalizedDescription() {
        #expect(httpError(502, badGatewayPage).localizedDescription == "Couldn't reach GitHub — HTTP 502")
    }

    // "describes something thrown that is not an Error at all": Swift only throws `Error`s.
}

@Suite struct RestrictedOrganizationsTests {
    @Test func readsTheOrgGitHubNamedInTheError() {
        #expect(restrictedOrganizations(graphqlError([restrictionMessage("status-im")], data: nil)) == ["status-im"])
    }

    @Test func collectsEveryOrgWhenSeveralAreNamed() {
        let error = graphqlError([
            "the `status-im` organization has enabled OAuth App access restrictions",
            "the `acme` organization has enabled OAuth App access restrictions",
        ], data: nil)
        #expect(restrictedOrganizations(error) == ["acme", "status-im"])
    }

    @Test func isEmptyForAnUnrelatedFailure() {
        #expect(restrictedOrganizations(unrelatedGraphQLError).isEmpty)
        #expect(restrictedOrganizations(TestError(restrictionMessage("status-im"))).isEmpty)
    }

    @Test func readsTheOrgOutOfAPlain403WhichCarriesItOnlyOnItsMessage() {
        #expect(restrictedOrganizations(httpError(403, restrictionMessage("status-im"))) == ["status-im"])
    }

    @Test func readsGitHubsFullRealMessage() {
        let real = "Although you appear to have the correct authorization credentials, the `acme` organization has enabled OAuth App access restrictions, meaning that data access to third-parties is limited. For more information on these policies, including how to update them, see https://docs.github.com/articles/restricting-access-to-your-organization-s-data/"
        #expect(restrictedOrganizations(graphqlError([real], data: nil)) == ["acme"])
    }

    @Test func survivesRewordingOfTheSentenceAroundTheOrg() {
        let reworded = [
            "The `acme` organization has OAuth App access restrictions enabled.",
            "`acme` organization restricts data access to third-party applications.",
            "the `acme`  organization has enabled OAuth App access restrictions",
        ]
        for message in reworded {
            #expect(restrictedOrganizations(graphqlError([message], data: nil)) == ["acme"], "\(message)")
            #expect(isOnlyRestriction(graphqlError([message], data: nil)), "\(message)")
        }
    }

    @Test func ignoresAnOrgNamedInAnErrorThatIsNotARestriction() {
        #expect(restrictedOrganizations(graphqlError(["The `acme` organization could not be found."], data: nil)).isEmpty)
    }

    @Test func doesNotPairAnOrgInOneEntryWithARestrictionMarkerInAnother() {
        let error = graphqlError([
            "The `acme` organization could not be found.",
            "Resource protected by access restrictions.",
        ], data: nil)
        #expect(restrictedOrganizations(error).isEmpty)
        #expect(!isOnlyRestriction(error))
    }
}

@Suite struct IsOnlyRestrictionTests {
    @Test func isTrueWhenEveryReportedErrorIsARestriction() {
        #expect(isOnlyRestriction(graphqlError([restrictionMessage("status-im")], data: nil)))
    }

    @Test func isFalseWhenSomethingElseFailedInTheSameResponse() {
        let error = graphqlError([
            "the `status-im` organization has enabled OAuth App access restrictions",
            "Something went wrong while executing your query.",
        ], data: searchResult([]))
        #expect(!isOnlyRestriction(error))
    }

    @Test func isTrueForThePlain403ShapeWhichCarriesNoErrorsToWalk() {
        #expect(isOnlyRestriction(httpError(403, restrictionMessage("status-im"))))
    }

    @Test func isFalseForAnUnrelatedFailure() {
        #expect(!isOnlyRestriction(GitHubError.network("network down")))
        #expect(!isOnlyRestriction(TestError("network down")))
        #expect(!isOnlyRestriction(graphqlError([], data: nil)))
    }
}

@Suite struct GraphQLPartialDataTests {
    @Test func returnsThePayloadAPartialGraphQLErrorCarried() {
        let data = searchResult(["PR_1"])
        #expect(decodeJSON(graphqlPartialData(graphqlError([restrictionMessage("status-im")], data: data))) == data)
    }

    @Test func isNilForAnythingThatIsNotAGraphQLResponseError() {
        #expect(graphqlPartialData(GitHubError.network("network down")) == nil)
        #expect(graphqlPartialData(TestError("network down")) == nil)
        #expect(graphqlPartialData(nil) == nil)
    }
}

@Suite struct FormatRestrictedOrgsTests {
    @Test func isNilWhenNothingWasRestricted() {
        #expect(formatRestrictedOrgs([]) == nil)
    }

    @Test func namesOneOrg() {
        #expect(formatRestrictedOrgs(["status-im"]) == "status-im hasn't approved Pullover")
    }

    @Test func namesTwoOrgs() {
        #expect(formatRestrictedOrgs(["acme", "status-im"]) == "acme and status-im haven't approved Pullover")
    }

    @Test func namesThreeOrgsWithoutDroppingTheLast() {
        #expect(formatRestrictedOrgs(["acme", "beta", "status-im"]) == "acme, beta and status-im haven't approved Pullover")
    }
}

@Suite struct MergeOrgsTests {
    @Test func isEmptyWhenThereIsNothingToMerge() {
        #expect(mergeOrgs().isEmpty)
        #expect(mergeOrgs([], []).isEmpty)
    }

    @Test func deduplicatesAcrossListsAndSortsSoTheWarningCopyIsStable() {
        #expect(mergeOrgs(["status-im"], ["acme", "status-im"], ["beta"]) == ["acme", "beta", "status-im"])
    }
}

@Suite struct IsTransientErrorTests {
    @Test(arguments: [500, 502, 503, 504])
    func matchesGitHubOrItsGatewayFailingOnItsOwnSide(status: Int) {
        #expect(isTransientError(httpError(status)))
    }

    @Test func matchesANetworkFailure() {
        #expect(isTransientError(GitHubError.network("The network connection was lost.")))
    }

    @Test(arguments: [401, 403, 429, 404])
    func doesNotMatchADeadTokenOrARateLimitWhichNeverAnswerDifferently(status: Int) {
        #expect(!isTransientError(httpError(status)))
    }

    @Test func doesNotMatchAGraphQLErrorWhoseQueryWasAnswered() {
        #expect(!isTransientError(unrelatedGraphQLError))
    }

    @Test func doesNotMatchAStatusOutsideThe5xxRangeAtAll() {
        #expect(!isTransientError(httpError(600)))
        #expect(!isTransientError(httpError(0)))
    }

    @Test func doesNotMatchAMalformedAnswerOrAnErrorFromElsewhere() {
        #expect(!isTransientError(GitHubError.malformed("no data")))
        #expect(!isTransientError(TestError("network down")))
    }
}

@Suite struct IsAuthErrorTests {
    @Test func matchesA401() {
        #expect(isAuthError(httpError(401, "Bad credentials")))
    }

    @Test func doesNotMatchADifferentStatusLikeARateLimitOrServerError() {
        #expect(!isAuthError(httpError(403, "API rate limit exceeded")))
        #expect(!isAuthError(httpError(502, "Server Error")))
    }

    @Test func doesNotMatchAGraphQLErrorWhichCarriesNoStatus() {
        #expect(!isAuthError(unrelatedGraphQLError))
    }

    @Test func doesNotMatchAPlainNetworkFailure() {
        #expect(!isAuthError(GitHubError.network("fetch failed")))
        #expect(!isAuthError(TestError("Bad credentials")))
    }
}

@Suite struct InterpretResponseTests {
    private func body(_ json: String) -> Data { Data(json.utf8) }

    @Test func turnsANon2xxJSONAnswerIntoAnHTTPErrorWithItsMessageAndLowercasedHeaders() {
        #expect(throws: GitHubError.http(status: 401, message: "Bad credentials", headers: ["x-ratelimit-remaining": "0"])) {
            try URLSessionGraphQLClient.interpret(
                status: 401,
                headers: ["X-RateLimit-Remaining": "0"],
                body: body(#"{"message":"Bad credentials","documentation_url":"https://docs.github.com"}"#)
            )
        }
    }

    @Test func keepsANon2xxHTMLBodyAsTheMessageForDescribeErrorToReplace() {
        let error = #expect(throws: GitHubError.self) {
            try URLSessionGraphQLClient.interpret(status: 502, headers: [:], body: body(badGatewayPage))
        }
        #expect(error == .http(status: 502, message: badGatewayPage, headers: [:]))
        #expect(error.map(describeError) == "Couldn't reach GitHub — HTTP 502")
    }

    @Test func turnsA200WithErrorsIntoAGraphQLErrorCarryingThePartialData() {
        let error = #expect(throws: GitHubError.self) {
            try URLSessionGraphQLClient.interpret(status: 200, headers: [:], body: body("""
            {"data":{"search":{"nodes":[{"id":"PR_1"}]}},"errors":[{"message":"one"},{"message":"two"}]}
            """))
        }
        guard case let .graphql(messages, partialData)? = error else {
            Issue.record("expected a GraphQL error, got \(String(describing: error))")
            return
        }
        #expect(messages == ["one", "two"])
        #expect(decodeJSON(partialData) == searchResult(["PR_1"]))
    }

    @Test func carriesNoPartialDataWhenTheErrorsCameWithANullPayload() {
        #expect(throws: GitHubError.graphql(messages: ["nope"], partialData: nil)) {
            try URLSessionGraphQLClient.interpret(status: 200, headers: [:], body: body(#"{"data":null,"errors":[{"message":"nope"}]}"#))
        }
    }

    @Test func returnsTheDataOfA200() throws {
        let data = try URLSessionGraphQLClient.interpret(status: 200, headers: [:], body: body(#"{"data":{"viewer":{"login":"vlad"}}}"#))
        #expect(decodeJSON(data) == ["viewer": ["login": "vlad"]])
    }

    @Test func refusesA200ThatIsNotJSONOrCarriesNoData() {
        #expect(throws: GitHubError.malformed("GitHub answered with something that isn't JSON")) {
            try URLSessionGraphQLClient.interpret(status: 200, headers: [:], body: body("<html></html>"))
        }
        #expect(throws: GitHubError.malformed("GitHub answered without any data")) {
            try URLSessionGraphQLClient.interpret(status: 200, headers: [:], body: body(#"{"data":null}"#))
        }
    }
}
