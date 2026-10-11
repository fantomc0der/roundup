# herdr mechanics behind the CLI

Verified against herdr 0.9.3 and Claude Code 2.1.296 on Windows. The installed binary is the authority: `herdr agent`, `herdr pane`, `herdr tab`, `herdr workspace` (no subcommand) print each group's syntax. Never run bare `herdr`, it attaches the TUI.

## What the CLI does

`roundup init`:
- Resolves the layout (`auto` rule in SKILL.md), detects whether the caller is inside herdr via `HERDR_ENV=1` and `HERDR_PANE_ID`.
- `split`: uses `HERDR_WORKSPACE_ID`, `HERDR_TAB_ID`, `HERDR_PANE_ID` as the anchor; creates nothing.
- `tab`: `herdr tab create --workspace <ws> --cwd <cwd> --label team:<team> --no-focus`; the workspace is `HERDR_WORKSPACE_ID` or the focused one from `herdr workspace list`. With no workspace at all it creates one and switches to `workspace`.
- `workspace`: `herdr workspace create --cwd <cwd> --label team:<team> --no-focus`.
- Writes `manifest.json` (ids, what was created, teammates) and `settings.json` with `{"crossSessionInbound":"accept"}` so teammates always accept the lead's messages.

`roundup spawn`:
- Picks a pane: the container's root pane for the first teammate in `tab` and `workspace`, otherwise `herdr pane split <earlier teammate pane> --direction right|down --cwd <cwd> --env ROUNDUP_...=... --no-focus`, alternating directions so the tab fills as a grid. In `workspace` layout every later teammate gets `herdr tab create --label <name> --env ...`.
- The `--env` variables (`ROUNDUP_TEAM`, `ROUNDUP_NAME`, `ROUNDUP_KIND`, `ROUNDUP_LEAD`, `ROUNDUP_LEAD_SESSION_ID`, `ROUNDUP_DIR`, `ROUNDUP_BRIEF`) are inherited by the pane's shell and by `claude`, which is how the mod inside the teammate knows who it is. A root pane created at `init` carries no environment, so the mod falls back to the manifest for that teammate.
- `herdr pane rename <pane> <name>` so the sidebar reads well.
- `herdr agent start <name> --kind claude --pane <pane> --timeout 120000 -- --name <name> --append-system-prompt "<identity, role, brief path, lead name, kind rule>" --settings <settings.json> [--agent] [--model] [--permission-mode] [extra]`.
- On `agent_not_ready`: reads the pane; if it is the folder-trust dialog and `--auto-trust` was given, sends `down enter`; otherwise exits 3 with the screen in `error.data.screen`.
- Records the teammate in the manifest before any wait, then waits until the agent is idle **and** the pane shows the `❯` input box (herdr reports idle a few seconds before Claude accepts input; text typed in that gap is dropped). A `blocked` state must persist 12 seconds to fail, because a just-answered dialog still reads as blocked for a moment.
- Kickoff: waits up to 5 seconds for the mod to stamp `kickoff: mod`; otherwise `herdr agent prompt <name> "Read your briefing at <brief> ..." --wait --until working --until blocked --timeout 20000`. On a stall it checks whether the text sits in the input box (then `enter`) or resends once. The JSON `kickoff` field is `working`, `blocked`, `mod`, `stalled`, or `skipped`.

`roundup release`: `herdr agent prompt <name> "/exit"`, waits up to 10 s for the name to leave `herdr agent list`, then `herdr pane close` (or `herdr tab close` in `workspace` layout). Closing the pane is what actually ends the session; the `/exit` is a courtesy so the transcript flushes.

`roundup close`: releases everyone, then closes the tab or workspace only if `init` created it.

`roundup prompt <team> <name> "<text>"` is the same verified typed prompt used for kickoff. It carries the user's authority, unlike a `SendMessage`, so use it only to redirect a teammate the way the user would, never for discussion content.

## Raw recipes

Read a teammate's recent transcript (works on the alternate screen when the agent is idle):

```bash
roundup read <team> <name> --lines 150          # recent-unwrapped; falls back to the visible screen while working
roundup read <team> <name> --visible
```

Confirm a prompt landed, then wait for the turn to end:

```bash
roundup prompt <team> <name> "<text>"           # state: working, blocked, or stalled
roundup wait <team> <name> --timeout 600000     # idle, done, or blocked
```

`idle` and `done` both mean ready for input (`done` is idle that nobody has looked at yet). `blocked` means a recognized dialog: permission prompt, question, trust dialog. `unknown` is unclassified, not finished.

Answer a dialog (only after reading it and deciding it is yours to answer):

```bash
roundup read <team> <name> --visible
roundup keys <team> <name> down enter      # select the second option
roundup keys <team> <name> esc             # dismiss
```

Discover live state:

```bash
roundup status <team>
herdr agent list | jq -c '.result.agents[] | {name, agent_status, pane_id, tab_id, workspace_id}'
herdr workspace list | jq -c '.result.workspaces[] | {workspace_id, label, focused}'
```

JSON paths from creation calls: `workspace create` gives `.result.workspace.workspace_id`, `.result.tab.tab_id`, `.result.root_pane.pane_id`; `tab create` gives `.result.tab.tab_id`, `.result.root_pane.pane_id`; `pane split` gives `.result.pane.pane_id`.

## Startup dialogs you may see

- **Folder trust** ("Is this a project you created or one you trust?"): appears for a `cwd` this user has not trusted in Claude Code. `--auto-trust` answers it for the team's `cwd` only. For any other folder, ask the user.
- **Bypass permissions confirmation**: only with `--dangerously-skip-permissions`. Do not pass that flag unless the lead runs with it; then ask the user before accepting.
- **Login / token expired**: cannot be solved from the lead. Tell the user which pane needs them.
- **Update or release notes banner**: usually clears with `esc` or `enter`; read the screen first.

## How the command is launched

On Windows, herdr types a PowerShell line into the pane that single-quotes each argument (`& claude '--name' modal-pm '--append-system-prompt' '...'`). The CLI replaces double quotes in the system prompt with single quotes to keep that line valid. Keep `--role` text free of newlines and double quotes; the detailed material belongs in the brief file.

Paths handed to a teammate are native paths. The CLI converts Git Bash spellings (`/c/code/...`) itself.

## Safety rules carried over from herdr's own skill

- `--no-focus` on everything; the user's focus stays where it is.
- Target panes by id or agents by unique name, never by "the focused pane", which may belong to the user.
- Do not close anything the team did not create; `workspace close --group` is never a shortcut.
- Never `herdr server stop`.
- A timeout does not prove a prompt was never delivered; read before resending.
