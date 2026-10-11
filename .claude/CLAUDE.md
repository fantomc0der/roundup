# roundup: contributor instructions

roundup is a Claude Code plugin. It bundles a skill (`skills/roundup/`), a zero-dependency Node CLI (`bin/roundup`, source in `src/`), a mod (`hooks/register.tsx`), and role definitions (`agents/`). `SPECIFICATION.md` is the design; keep it current when behavior changes.

## Layout rules the plugin loader imposes

- This file lives in `.claude/`, not at the repo root. A root `CLAUDE.md` is not loaded by the plugin and makes `claude plugin validate` warn.
- `bin/` is on the Bash tool PATH while the plugin is enabled, which is how the skill calls `roundup` as a bare command.
- `skills/roundup/SKILL.md` becomes `/roundup:roundup`; `agents/*.md` become `roundup:<name>`.
- The mod has no Node APIs. Anything that needs a process goes through `$.process.run` with an absolute path under `$.plugin.root`.

## Working on it

- Run the plugin from the checkout: `claude --plugin-dir .` (hot reloads the mod on each turn in an interactive session).
- Validate before every commit: `npm run validate` (`claude plugin validate . --strict`).
- Unit tests: `npm test` (`node --test` over `tests/unit`, herdr is faked by `tests/fake-herdr/fake.mjs`).
- Mod tests: `npm run test:mod` (`claude plugin test .`).
- Type check: `npm run typecheck` (`tsc -p .`) against `types/vendor/claude-code.d.ts`, a copy of the engine's own declaration file. Refresh it after a Claude Code bump by copying `.claude-plugin/types/claude-code/index.d.ts`, which the engine writes beside the mod on an interactive `claude --plugin-dir .` load (that folder is gitignored), and bump `CLAUDE_CODE_VERSION` in `ci.yml` to match its first line.
- Real herdr end-to-end checks are manual: spawn a teammate with `-- --plugin-dir <this checkout>` so the mod loads in it. Never run them in CI.

## Conventions

- Zero runtime dependencies. `typescript` is the only dev dependency.
- Mod rules the validator enforces: `$.env.get` takes string literals; a helper that receives the engine interface must be a top-level function declaration in `hooks/register.tsx`, never an import; guards on `tool.check` carry a `.catch` that still refuses.
- Every CLI subcommand prints one JSON document on stdout on success, and `{ "error": { "code", "message", "hint" } }` on stderr with exit 1 on failure (2 for usage, 3 for "spawned but not ready"). `read` and `doctor` print text.
- Every herdr invocation goes through `src/herdr.mjs`: argv arrays, never shell strings; strip `\r`; raise on `.error`.
- The CLI never closes a herdr object it did not create and never answers a startup dialog other than folder trust (and only with `--auto-trust`).
- Prose in markdown is never hard-wrapped; one paragraph is one line.
- Source comments describe current behavior, never the history of an edit.
- Do not touch whitespace on lines you are not otherwise changing. Do not run repo-wide formatters.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `docs:`, `ci:`, `test:`, `chore:`).

## Versioning and release

- `version` in `.claude-plugin/plugin.json` and `package.json` must match. Bump both with a `CHANGELOG.md` section.
- Tag `vX.Y.Z` on `main` triggers `release.yml`, which checks the tag against the manifests and publishes a GitHub release with the changelog section as the body.
