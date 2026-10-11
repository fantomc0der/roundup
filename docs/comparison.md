# roundup compared with the alternatives

| | roundup | Native agent teams | Subagents (Agent tool) | OMC `/team` |
| :- | :- | :- | :- | :- |
| Where teammates run | Independent `claude` sessions in herdr panes | Inside the lead's process, or tmux/iTerm2 split panes | Inside the lead's process | tmux panes |
| Windows | Yes, through herdr | In-process only; split panes unsupported on Windows Terminal | Yes | tmux required |
| User can watch and steer each teammate | Yes: click into any pane, type to it | Only in split-pane mode | No | Yes |
| Teammates survive the lead | Yes, and transcripts resume with `claude --resume` | No | No | Yes |
| Teammate-to-teammate messaging | Yes, by name | Yes | No | Limited |
| Shared task list | File-backed board with a lock, dependencies, and tools in every session | Built in, with dependencies and file locking | No | Built in |
| Structured protocols (shutdown, plan approval) | No; the lead decides and closes | Yes | n/a | Partial |
| Idle notification to the lead | Turn-complete pings from the mod; `notify_when_idle`; `roundup wait` | Automatic | Automatic on completion | Yes |
| Role enforcement | Mod guard on tool calls per kind | Permissions only | Tool allowlist | Permissions only |
| Cost when idle | Zero tokens, screen space only | Zero tokens | n/a | Zero tokens |
| Setup | herdr server running, plugin installed | Environment flag | None | OMC plus tmux |

## What native agent teams do better

- Their task list is in the engine, with file locking the harness enforces. roundup's board is honest but external: a builder can still edit a file it did not claim unless the lead's briefs and the review catch it.
- Protocol messages (shutdown requests, plan approvals) are typed and acknowledged. roundup relies on plain-text messages and the lead's judgment.
- No terminal multiplexer to run. roundup needs a herdr server.

## What roundup does better

- Works on Windows with real split panes, and on every platform the same way.
- Every teammate is a normal session the user can open, read, redirect, and resume. The lead keeps working while teammates think, and nothing dies when the lead's session ends.
- Teammates can carry different models, permission modes, working directories, and agent definitions.
- The mod turns role rules into guarantees: an advisor cannot edit project files even if asked nicely.

## When to use which

- One quick read-only opinion: a subagent, possibly with `--agent roundup:<name>`.
- Several perspectives that should argue, with the user watching: roundup.
- Parallel implementation across independent file sets on a machine without herdr: native agent teams.
