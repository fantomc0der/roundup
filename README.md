# roundup

Round up a team of Claude Code sessions in [herdr](https://herdr.dev) panes, let them argue it out, then build.

roundup is a Claude Code plugin that gives one session (the lead) a reliable way to spawn, brief, converse with, and dismiss a team of independent Claude Code sessions. Each teammate is a real, named, resumable session running in a herdr pane that you can watch and click into. The lead talks to teammates, and teammates talk to each other, through Claude Code's cross-session messaging. It reproduces the useful parts of native agent teams on any platform where herdr runs, including Windows, where native split panes are unavailable.

```text
┌──────────────────────────────┬──────────────────────────────┐
│ lead (you)                   │ modal-pm                     │
│                              │ Product manager: scope,      │
│ > The modal looks weird.     │ priority, what ships         │
│   Spawn a PM and a UX        ├──────────────────────────────┤
│   specialist to decide what  │ modal-ux                     │
│   changes, then implement    │ UX specialist: hierarchy,    │
│   it on a branch.            │ affordance, accessibility    │
└──────────────────────────────┴──────────────────────────────┘
```

## Install

```text
/plugin install roundup --marketplace fantomc0der/roundup
```

Answer `y` to add the marketplace, then pick the user scope.

## Requirements

- A running [herdr](https://herdr.dev) server (0.9 or newer) with the `herdr` CLI on PATH.
- Claude Code 2.1.234 or newer on native Windows, 2.1.224 or newer on macOS, Linux, and WSL 2 (cross-session messaging).
- Node.js 18 or newer (the `roundup` CLI has no dependencies).

## How it works

Three pieces ship in one plugin:

| Piece | Where | What it does |
| :- | :- | :- |
| Skill | `skills/roundup/` | The orchestration pattern: frame the problem, spawn, run a structured discussion, synthesize, decide what happens to the team, implement, review, close. |
| CLI | `bin/roundup` | The deterministic part: herdr panes and tabs, session startup, readiness detection, kickoff, manifest bookkeeping, teardown, task board. |
| Mod | `hooks/register.ts` | Hooks that run inside the sessions: brief injection with user authority, role guards on tool calls, turn-complete pings to the lead, a `/roundup` command and pane for the lead. Inert outside a team. |

Two channels, never confused: herdr for lifecycle (create, read, wait, close), cross-session messaging for content (briefs, positions, critiques, decisions).

## Use

Ask for a team in plain words:

> The UI for this modal looks weird because the primary button is below the fold. Spawn a team with a product manager and a UX specialist to decide what should change, then implement it on a new branch.

The lead reads the code, writes a problem statement, briefs each teammate, runs three rounds (positions, cross-critique, convergence), writes a synthesis, announces whether the team stays for review, implements on a branch, collects reviews, and closes the team.

### Layouts

| Mode | Teammates appear as | `auto` picks it when |
| :- | :- | :- |
| `split` | Panes split off the lead's own pane | Lead is inside a herdr pane and the team has 1 or 2 members |
| `tab` | A new tab `team:<name>` with panes in a grid | 3 or 4 members, or the lead is outside herdr |
| `workspace` | A new workspace `team:<name>` with one tab per teammate | 5 or more members, a build-together team, or a different working directory |

Say "next to me", "in a new tab", or "in its own workspace" to force one. Set a default in the plugin's config.

### Retention

| Policy | What happens after synthesis |
| :- | :- |
| `dismiss` | Team closed, lead implements alone |
| `keep-for-review` | Teammates stand by, review the diff or PR in their lens, then close |
| `build-together` | Teammates own disjoint file sets and work from a shared task board; the lead integrates and verifies |

### Permission classes

Teammates always accept the lead's messages. Replies follow the lead's own settings: if the lead runs with `bypassPermissions` and teammates do not, replies are held for your approval. The skill spawns teammates in the lead's class; the simplest fix for a bypass-mode lead is `"crossSessionInbound": "accept"` in your user settings.

## Compared with native agent teams

Native agent teams give a shared task list with dependencies, structured shutdown and plan-approval protocols, and in-process teammates. roundup trades those for independent, resumable, user-visible sessions in herdr panes on every platform, a file-backed task board for build-together teams, and a lead that keeps working while teammates think. See `docs/comparison.md`.

## Development

See `.claude/CLAUDE.md` for conventions and `SPECIFICATION.md` for the design. Run `claude --plugin-dir .` to use the checkout as the plugin.

## License

MIT
