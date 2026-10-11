# Windows notes

roundup was built and verified on Windows 11 with herdr 0.9.3 and Claude Code 2.1.296. These are the platform details that mattered.

## The launch line

herdr starts a session by typing a PowerShell line into the pane that single-quotes each argument:

```text
& claude '--name' modal-pm '--append-system-prompt' '...' '--settings' 'C:\Users\you\.claude\roundup\modal\settings.json'
```

A double quote inside the system prompt is harmless, but a single quote would end the argument. The CLI keeps the prompt on one line and replaces double quotes with single quotes; the detailed material belongs in the brief file, which the teammate reads with its own tools. Keep `--role` text free of quotes.

## Paths

Teammates run a native `claude`, so every path handed to one must be a native Windows path. The CLI converts Git Bash spellings (`/c/code/app`) itself, and every path it generates comes from Node's own `homedir()` and `path.join`, so nothing needs `cygpath`.

Inside a teammate, Bash is Git Bash: a backslash path must be quoted (`git -C "C:\code\app" log`), or the backslashes vanish. That is a teammate's own quoting, not roundup's.

## Slash commands typed from Git Bash

MSYS, the layer under Git Bash, rewrites an argument that starts with a slash into a Windows path before a native program sees it, so `roundup prompt team name "/exit"` would arrive as `C:/Program Files/Git/exit`. The CLI undoes that rewrite for prompt text using Git's `EXEPATH`. Raw `herdr agent prompt` calls from Bash need `MSYS_NO_PATHCONV=1` in front of them.

## CRLF

Some tools on Windows emit CRLF line endings (the Chocolatey `jq` build does, which broke the original bash prototype). `src/herdr.mjs` strips `\r` from everything herdr prints before parsing it, and the fake herdr used in tests can emit CRLF to prove it.

## WSL versus native

Cross-session messaging cannot cross the WSL boundary: a native Windows session and a WSL 2 session do not see each other. Teammates run in whatever shell herdr opens, so a native herdr needs a native lead. Keep every session on one side.

## Folder trust

A `cwd` the user has never opened in Claude Code shows the folder-trust dialog at startup. `roundup spawn --auto-trust` answers it for the team's own `cwd` and nothing else; any other dialog comes back as exit 3 with the screen text so the lead can ask the user.

## Shebang scripts

`bin/roundup` is an extensionless Node script with a shebang. The Bash tool runs it directly. For PowerShell users, `bin/roundup.cmd` wraps it. The repository pins LF line endings through `.gitattributes` so the shebang survives a checkout with `core.autocrlf=true`.
