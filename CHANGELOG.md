# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Repository scaffold: plugin and marketplace manifests, CI, release workflow, Dependabot, contributor instructions.
- `bin/roundup`, a zero-dependency Node CLI for the herdr side of a team: preflight, init with split, tab, and workspace layouts, spawn with readiness detection and verified kickoff, status, read, wait, prompt, keys, release, close, relead, list, dir, and doctor.
- The `roundup` skill with references for orchestration patterns, herdr mechanics, and cross-session messaging.
- Seven role definitions: pm, ux, architect, engineer, security-reviewer, qa, devils-advocate.
- The mod: teammates get their brief submitted with user authority, a role guard on Edit, Write, NotebookEdit, and Bash for advisors and reviewers, a turn-complete ping to the lead, a message log, and a system prompt reminder; leads get the `/roundup` command and pane.
- `roundup task`, a lock-guarded task board for build-together teams with dependencies, ownership warnings, and `task_list`, `task_claim_next`, and `task_complete` tools in every team session.
- A fake herdr for unit tests and `claude plugin test` coverage for the mod.
- Docs: architecture, comparison with native agent teams, and Windows notes.

[Unreleased]: https://github.com/fantomc0der/roundup/compare/main...HEAD
