# Cross-session messaging facts that matter for a team

Source: Claude Code docs for cross-session messaging and agent teams, confirmed on Claude Code 2.1.296 (Windows). Requires 2.1.224+ (macOS, Linux, WSL 2) or 2.1.234+ (native Windows). Nothing to enable; `/list-agents` (alias `/peers`) exists when the feature is present.

## Addressing

- A session answers to the name set with `claude --name <name>` or `/rename`. `roundup spawn` passes `--name`, so the herdr agent name and the Claude session name are the same string.
- `ListAgents` lists reachable sessions and, on its first line, **this session's own name**. Teammates need that name as their reply target; the brief and the system prompt carry it.
- `SendMessage` with `to: <name>` delivers when exactly one live session answers to it. If two do, the listing shows a `[ref]` to append. Prefixing teammate names with the team slug avoids this.
- Replies arrive as `<cross-session-message from="..." from-name="<name>">`. Reply to the `from` address (teammates are told this in their system prompt).
- Subagents inside the lead send under the lead's address and replies come to the lead, not the subagent. Run the team from the main conversation.

## Delivery

- The receiving Claude reads a message between tool calls during a turn, or a new turn starts if it was idle. A running tool is never interrupted.
- Plain text only. `@path` attaches nothing on the receiving side and slash commands in the text do not run. Share files by path under the team's `shared/` directory.
- A message cannot approve a permission prompt, change settings, or relay an action the sender was denied (permission laundering). Route blocked work to the user.
- Same-machine cap is about a million characters per message; a rapid burst to one session is refused at the sender and the error says to batch. Loops are throttled automatically.
- WSL 2 and native Windows sessions cannot see each other; a session in a container cannot reach the host.

## Holds and permission classes

When no `crossSessionInbound` value applies, delivery depends on the two sessions' permission classes. Sessions that bypass permission prompts (`bypassPermissions`, and plan mode in an interactive terminal where bypass is available) are one class; `default`, `auto`, `acceptEdits`, and `dontAsk` are the other.

- Receiver prompts (second class): delivered, unless the sender is in the bypass class, in which case it is held for the user.
- Receiver bypasses: held, unless the sender also bypasses.

Every teammate gets `--settings` with `crossSessionInbound: accept`, so the lead's messages always reach teammates. The reverse direction follows the lead's own settings: if the lead runs in the bypass class and teammates do not, teammate replies are held until the user approves them in the lead's terminal. That is why SKILL.md says to spawn teammates in the lead's class. The simplest fix for a bypass-mode lead is `"crossSessionInbound": "accept"` in the user's settings. A held message shows the user an approval dialog that expires after `dialogExpiry` (five minutes by default).

A session in the VS Code extension or the Desktop app cannot show the dialog and keeps held messages until the same deadline.

The mod's turn-complete pings are sent with `$.session.send` and follow the same inbound rules on the lead's side.

## Idle notices

`SendMessage` with `notify_when_idle: true` (with or without a message) subscribes to one notice when a same-machine session next goes idle or exits. It is one-shot, costs the watched session nothing, and expires after 12 hours. Use it instead of polling. Only the main conversation can subscribe, and only to local sessions. The notice includes a one-line status when both sides are in the same permission class.

`roundup wait <team> <name>` blocks until idle, done, or blocked. Use the wait when you need the result inside a Bash step, the idle notice when you want to keep working meanwhile. With the mod loaded, teammates also ping the lead after each completed turn, so neither is usually needed.

## What the user sees

Each incoming message renders in the receiving terminal as a dim one-line preview (`› Message from @modal-ux: ...`), expandable with Ctrl+O. The user can click into any teammate's herdr pane and type to it directly; that input carries the user's authority, so a teammate may receive instructions you did not send. The brief asks teammates to tell you when the user redirected them.

## Comparison with native agent teams

Native agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) give a shared task list with dependency tracking, structured shutdown and plan-approval protocols, and automatic idle notifications to the lead, but teammates live inside the lead's process (or in tmux/iTerm2 split panes, which are unsupported on Windows Terminal), do not survive the lead, and cannot be opened by the user as ordinary sessions. roundup trades the protocol messages for independent, resumable sessions in herdr panes that the user can see and steer, cross-platform, and replaces the task list with `roundup task` for build-together teams.
