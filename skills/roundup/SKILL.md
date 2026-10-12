---
name: roundup
description: Round up a team of independent Claude Code sessions in herdr terminal panes and orchestrate them. Each teammate is a real, named interactive session with its own role that talks to the lead and to the other teammates through cross-session messaging, while the current session stays the lead that frames the problem, runs the discussion, synthesizes, implements, and decides when teammates are dismissed. Use this whenever the user asks for a team, panel, council, committee, roundup, or group of agents, wants several perspectives or roles (product manager, UX specialist, architect, engineer, security reviewer, QA, devil's advocate) to discuss, debate, critique, or review something before or after it gets implemented, wants agents to build something together, or mentions herdr, teammates, agent teams, or spawning agents into panes, tabs, or workspaces. Prefer it over native agent teams, OMC /team, and plain subagents whenever a herdr server is running, even if the user never says the word herdr.
---

# roundup

You are the **lead**. Teammates are full interactive Claude Code sessions running in herdr panes next to the user, who can watch any of them, click into a pane, and talk to a teammate directly. Two channels exist and they are not interchangeable:

| Channel | Used for | How |
| :- | :- | :- |
| `roundup` CLI (herdr underneath) | lifecycle and the terminal: create panes, start sessions, read a screen, see idle/working/blocked, answer a dialog, close | `roundup <command>` in Bash; raw `herdr` only for things the CLI does not cover |
| Cross-session messaging | content: briefs, questions, positions, critiques, decisions, status | `SendMessage` to a teammate's session name; replies arrive here automatically |

The first prompt a teammate receives carries the user's authority (the mod submits it as the user, or the CLI types it into the pane); everything after that is a peer message. Peer messages are plain text: `@file` attaches nothing and slash commands do not run, so share artifacts as file paths under the team's `shared/` directory.

Plugin defaults, set in the plugin's config: layout `${user_config.default_layout}`, retention `${user_config.default_retention}`. Pass them to `init` as shown below; an explicit request from the user always wins.

## Preflight

```bash
roundup preflight      # herdr client and server, whether you are inside a herdr pane, live agent names
```

Then call `ListAgents`: its first line gives **this session's name**, which teammates need as their reply target. If `ListAgents` does not exist or `/list-agents` is unknown, cross-session messaging is unavailable and this skill cannot work; say so and offer subagents instead. If herdr is not running, say so and offer subagents.

You do not have to be inside herdr. Outside a pane the team lives in the focused herdr workspace (or a new one) instead of beside you.

## Phase 1: Frame the problem before spawning anyone

Teammates do not inherit your conversation. Everything they know comes from their brief, so the quality of the team is decided here, not during the discussion.

1. **Understand the ask yourself first.** Read the relevant code, screenshots, docs, or tickets. Form a rough opinion so you can tell when a teammate is off base.
2. **Write a problem statement** to `<team dir>/shared/problem.md` (get the directory from `roundup dir <team>` after init, or write it after init): what is wrong or wanted, constraints, the concrete artifact under discussion (paths, URLs, component names), and the decision the team must produce.
3. **Design the roster.** Pick 2 to 4 roles whose lenses genuinely differ and name them `<team>-<role>` (`modal-pm`, `modal-ux`). Use the roles the user named; add one only when a missing perspective would obviously change the outcome. More than four advisors produces noise. Role templates and the bundled role definitions are in `references/orchestration.md`.
4. **Decide the layout and the retention plan** (below) and tell the user in one line what you are about to spawn and why. Do not ask permission for the spawn itself unless the request was ambiguous about wanting a team at all.

Write one brief per teammate using the template in `references/orchestration.md`: the role and its lens, the problem statement path, the exact artifacts to look at, the output shape you want, the other teammates and their roles, and your session name.

## Phase 2: Spawn

```bash
roundup init <team> --lead <your session name> --size <N> --default-layout ${user_config.default_layout} --default-retention ${user_config.default_retention} [--layout split|tab|workspace] [--retention dismiss|keep-for-review|build-together] [--cwd <dir>]
roundup spawn <team> <team>-<role> --role "<one-line role>" --kind advisor|builder|reviewer --brief <path> --auto-trust [--agent roundup:<def>] [--model <alias>] [--permission-mode <mode>]
```

When the plugin's mod is loaded (the `/corral` command exists), the Bash form is enough: the mod adds your session id to `roundup init` so the manifest names this session as the lead, teammates can ping you when their turns end, and `/corral pane` and `/corral status` follow the team on their own. `/corral init <team> --lead <name> ...` does the same from the prompt.

`init` creates the team directory (`~/.claude/roundup/<team>/` with `briefs/`, `shared/`, `manifest.json`) and the herdr container for the layout. `spawn` creates a pane carrying the team's environment, starts `claude --name <name>` there with a short system prompt (identity, role, brief path, your name), waits until the input box is genuinely ready, and kicks off. Its JSON ends with `kickoff: working` (typed and confirmed), `mod` (the mod submitted the brief), `stalled` (read the pane before resending), or `skipped` (no brief). Spawn teammates one after another, not in parallel: each split is relative to the panes that exist.

Choices per teammate:

- **Kind** drives the mod's tool guard: `advisor` and `reviewer` cannot edit project files, `builder` can. Advisors during discussion, builders for build-together, reviewers for review passes.
- **Role definition**: `--agent roundup:pm` (or `ux`, `architect`, `engineer`, `security-reviewer`, `qa`, `devils-advocate`) layers the bundled lens on top of `--role`. A project's own `.claude/agents/` definition works the same way by name.
- **Model**: omit to inherit the user's default. Pass `--model` only when the user asked or the role is cheap and mechanical.
- **Permission mode**: match your own session's class. Messages between sessions of different classes are held for the user's approval, which silently stalls the discussion. If you are in auto, acceptEdits, or default, leave the flag off or pass the same mode; pass `bypassPermissions` or `plan` only if you are in that class yourself. Never pass `--dangerously-skip-permissions` unless your own session runs that way.
- `--auto-trust` answers the folder-trust dialog only for the team's `cwd`, which you already operate in with the user's consent. Any other startup dialog comes back as exit 3 with the pane contents; inspect it and ask the user before answering.

## Phase 3: Facilitate the discussion

Run a short, structured conversation and keep it from drifting. The default protocol has three rounds; skip or merge rounds when the question is small.

1. **Positions.** Each teammate sends you its initial position (the brief asked for this). Do not start implementing while waiting. Use `SendMessage` with `notify_when_idle: true`, or `roundup wait <team> <name>`, instead of polling.
2. **Cross-critique.** Forward the strongest disagreements verbatim and ask the teammates to argue them out directly by name. Ask each to disprove the others, not to be agreeable. Give a budget ("two exchanges, then send me your updated position").
3. **Converge.** Ask for final positions in a fixed shape: recommendation, top three reasons, what would change their mind, open questions for the user. Where positions still conflict, you decide, and say why.

Practices that keep the lead effective:

- Batch: one message with three questions beats three messages. Rapid bursts to one session are refused at the sender.
- Keep messages short; put anything long in `shared/` and message the path. Ask teammates to do the same.
- A teammate that is `blocked` is at a permission or question dialog in its pane. `roundup read <team> <name> --visible`, then answer it with `roundup keys` when it is routine for the work you assigned, or surface it to the user. A peer cannot approve anything on the user's behalf, and you must never ask a teammate to do something your own session was denied.
- Add a teammate mid-discussion only when a gap appears that nobody can fill. Release one early (`roundup release`) when it has nothing left to contribute.
- If a teammate goes quiet, `roundup status <team>`: `gone` means the session died; `idle` after you asked for something means your message was held or the teammate thinks it is done. Read the pane before resending.

## Phase 4: Synthesize and decide

Write `shared/synthesis.md`: the decision, the reasoning, dissent that was overruled and why, and the concrete change list. Present it to the user in prose (the user did not read the panes). If the user is present, give them the chance to redirect; if the request was autonomous ("then implement it"), proceed.

## Phase 5: Retention, implementation, review

Decide what happens to the team **before** you start building, and announce it.

| Policy | Pick it when | What happens |
| :- | :- | :- |
| `dismiss` | Advisory team, small or mechanical change, nobody has a reviewing lens | `roundup close` right after synthesis, then implement alone |
| `keep-for-review` (default for UI, UX, product, and API-shape work) | The advisors' lenses are exactly what a review needs; idle sessions cost nothing but screen space | Tell teammates to stand by, implement, send each the diff or PR link, ask for findings with severity in their lens, close after addressing them |
| `build-together` | The work splits into independent file sets and the user asked for the team to build, or parallelism clearly wins | Task board: `roundup task <team> add ... --owner <name> --files a,b`; builders `claim`/`next` and `complete`; you integrate, test, run a reviewer pass. Never let two builders own the same file. |

Implementation follows the user's normal rules: new branch, never commit to main, open a PR when appropriate, keep its description current. For review, give reviewers the exact thing to review (branch, PR URL, or diff path) plus the synthesis. If you dismissed the advisors, spawn a `reviewer` with a role that did not take part in the design.

## Phase 6: Close and report

```bash
roundup close <team>        # releases every teammate, then closes only the tab or workspace init created
```

Closing a pane ends the session, but its transcript stays resumable through `claude --resume` in that directory. Never close panes, tabs, or workspaces the team did not create. Report: the decision, what was built (branch, PR), which teammates were kept or dismissed and why, and where the artifacts are (`roundup dir <team>`).

## Layout

| Mode | Teammates appear as | `auto` picks it when |
| :- | :- | :- |
| `split` | Panes split off your own pane in your current tab | You are inside a herdr pane and the team has 1 or 2 members |
| `tab` | A new tab `team:<name>` in the current (or focused) workspace, panes in a grid | 3 or 4 members, or you are outside herdr |
| `workspace` | A new workspace `team:<name>` with one tab per teammate | 5 or more members, a build-together team, or a different `cwd` |

Map the user's words instead of asking: "next to me", "in this tab" mean `split`; "in a new tab", "one pane each" mean `tab`; "its own workspace", "one tab per agent", "separate window" mean `workspace`. Pass `--cwd` for a worktree or another checkout.

## Pitfalls

- Typing into a pane before its input box is ready loses the text silently. `roundup spawn` and `roundup prompt` wait and verify; with raw `herdr agent prompt`, add `--wait --until working --timeout 20000`.
- A typed `/exit` is not reliable; `roundup release` tries it, then closes the pane, which is authoritative.
- `herdr agent wait` returns immediately if the snapshot already matches, so `wait --until working` right after a prompt confirms delivery, and a plain `wait` afterwards waits for the turn to end.
- Names must match `[a-z][a-z0-9_-]{0,31}` and be unique among live herdr agents and sessions. Prefix with the team slug.
- On Windows, Git Bash rewrites a leading `/` in an argument into a path. `roundup prompt` undoes it; raw `herdr agent prompt <name> "/exit"` needs `MSYS_NO_PATHCONV=1` in front.
- WSL and native Windows sessions cannot message each other. Teammates run in herdr's shell, so on Windows the lead must be native too.

## References

- `references/orchestration.md`: role templates, bundled role definitions, brief template, discussion protocols, synthesis template, retention matrix, task board protocol, worked example.
- `references/herdr.md`: what the CLI does under the hood, raw herdr recipes, startup dialogs, JSON paths.
- `references/messaging.md`: cross-session messaging facts (delivery, holds, permission classes, limits, idle notices).
