# Pullover for AI agents

Pullover can serve its inbox to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io). An agent asks it which pull requests are waiting on you and why, and gets the answer from the same classified inbox the window shows — no second GitHub token, no polling of its own, no copy of the rules.

## Turn it on

The server is off until you say otherwise. Open **Settings** in Pullover, find **AI agents**, and flip **MCP server**. The address appears under the switch; that is the one to give your client.

> [!NOTE]
> The released app listens on `7855`. A build you run from source listens on `7856`, so the two can run side by side without fighting for the socket. Read the address off the Settings row rather than copying it from here.

## Connect a client

**Claude Code** takes it as one command:

```bash
claude mcp add --transport http pullover http://127.0.0.1:7855/mcp
```

Then ask it something like *"what pull requests are waiting on me?"*. Remove it again with `claude mcp remove pullover`.

**Anything else that speaks Streamable HTTP** is pointed at the same URL. There is no token and no header to set. A config file usually looks like this:

```json
{
  "mcpServers": {
    "pullover": {
      "type": "http",
      "url": "http://127.0.0.1:7855/mcp"
    }
  }
}
```

To check the server by hand, without any client:

```bash
curl -s -X POST http://127.0.0.1:7855/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## The tools

**`get_inbox`** returns the sections you see in the window: the pull requests that need you, grouped by why, longest wait first. Each one carries the reason Pullover put it there, how long it has been your move, its CI state, its place in a stack, and its link on github.com. Pass `includeWaiting` to get the "Waiting on others" section too.

It refreshes from GitHub first when the last fetch is more than a minute old — the same rule the window uses when you open it — so an agent and a click cost the same and see the same thing.

**`snooze_pull_request`** parks a pull request for a set number of hours, or — with no hours — until it wakes on its own. It wakes on exactly two things: somebody replying in an unresolved review thread you took part in, or a new commit. A new conversation comment, a fresh thread you are not in, or a CI result does not wake it, so reach for the hours when what you are waiting on is none of those. **`unsnooze_pull_request`** brings it back at any time. This is the one thing Pullover can do that the GitHub CLI cannot, and it is what makes *"put everything from that repo aside until tomorrow"* a sentence instead of a dozen clicks.

Both name a pull request the way you would anywhere else, by repository and number, and both reach any pull request Pullover has fetched — including ones your repository filter keeps out of the window. A pull request it has never fetched is refused rather than parked silently, and so is a draft, which the inbox does not show and a snooze could not affect.

A snooze is a note inside Pullover on your Mac. Nobody else sees it, it is undone in one click, and the until-activity kind clears itself. **Nothing an agent does through Pullover reaches GitHub.** To actually reply, approve or merge, an agent uses its own GitHub tooling, at the link Pullover gave it.

You do not need a snooze to mark finished work as done: once your reply lands on GitHub, Pullover reclassifies the pull request by itself on the next refresh.

## What it exposes, and to whom

The server binds to `127.0.0.1` and nothing else. It refuses any request that did not come from a program on this Mac, which includes the case of a web page in your browser being pointed at the loopback address.

What it serves is the inbox the window is built from: pull requests you are involved in, with a few fields the card does not print, such as the base branch and the exact timestamps. Any local program that can read your GitHub credentials could already fetch all of that from GitHub itself, which is why version one has no token. If that ever stops being true for your setup, turn the switch off.
