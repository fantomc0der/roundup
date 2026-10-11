# roundup: contributor instructions

roundup is a Claude Code plugin. It bundles a skill (`skills/roundup/`), a zero-dependency Node CLI (`bin/roundup`, source in `src/`), a mod (`hooks/register.ts`), and role definitions (`agents/`). `SPECIFICATION.md` is the design; keep it current when behavior changes.

## Layout rules the plugin loader imposes

- This file lives in `.claude/`, not at the repo root. A root `CLAUDE.md` is not loaded by the plugin and makes `claude plugin validate` warn.
- `bin/` is on the Bash tool PATH while the plugin is enabled, which is how the skill calls `roundup` as a bare command.
- `skills/roundup/SKILL.md` becomes `/roundup:roundup`; `agents/*.md` become `roundup:<name>`.
- The mod has no Node APIs. Anything that needs a process goes through `$.process.run` with an absolute path under `$.plugin.root`.

## Working on it

- Run the plugin from the checkout: `claude --plugin-dir .` (hot reloads the mod on each turn in an interactive session).
- Validate before every commit: `npm run validate` (`claude plugin validate . --strict`).
- Unit tests: `npm test` (`node --test tests/unit`, herdr is faked).
- Mod tests: `npm run test:mod` (`claude plugin test .`).
- Type check: `npm run typecheck` once the engine has written `.claude-plugin/types/` (it does so on the first load from this folder; that folder is gitignored).
- Real herdr end-to-end checks are manual and gated behind `ROUNDUP_E2E=1`; never run them in CI.

## Conventions

- Zero runtime dependencies. `typescript` is the only dev dependency.
- Every CLI subcommand prints one JSON document on stdout on success, and `{ "error": { "code", "message", "hint" } }` on stderr with exit 1 on failure (2 for usage, 3 for "spawned but not ready").
- Every herdr invocation goes through `src/herdr.mjs`: argv arrays, never shell strings; strip `\r`; raise on `.error`.
- The CLI never closes a herdr object it did not create and never answers a startup dialog other than folder trust (and only with `--auto-trust`).
- Prose in markdown is never hard-wrapped; one paragraph is one line.
- Source comments describe current behavior, never the history of an edit.
- Do not touch whitespace on lines you are not otherwise changing. Do not run repo-wide formatters.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `docs:`, `ci:`, `test:`, `chore:`).

## Versioning and release

- `version` in `.claude-plugin/plugin.json` and `package.json` must match. Bump both with a `CHANGELOG.md` section.
- Tag `vX.Y.Z` on `main` triggers `release.yml`, which checks the tag against the manifest and publishes a GitHub release with the changelog section as the body.
