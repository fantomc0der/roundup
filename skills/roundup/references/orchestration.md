# Orchestration patterns

## Contents

1. Role templates and bundled definitions
2. Brief template
3. Discussion protocols
4. Synthesis template
5. Retention decision matrix
6. Task board protocol (build-together)
7. Worked example: "the modal looks weird"

## 1. Role templates and bundled definitions

Each role is a lens. A brief should make the lens sharp enough that two teammates never produce the same answer. The plugin bundles a definition per common lens (`--agent roundup:<name>`); the `--role` one-liner still goes on the system prompt so the user sees it in the pane title and the mod knows the kind.

| Role | `--agent` | `--kind` | `--role` text | Ask for |
| :- | :- | :- | :- | :- |
| Product manager | `roundup:pm` | advisor | Product manager: user outcomes, scope, priority, what ships and what waits | The user problem in one sentence, what must change, what is out of scope, success criteria |
| UX specialist | `roundup:ux` | advisor | UX specialist: interaction design, hierarchy, affordance, accessibility, consistency with the design system | Specific interaction and visual changes, ordered by impact, each tied to a usability principle |
| Architect | `roundup:architect` | advisor | Software architect: structure, boundaries, data flow, long-term cost of each option | The cleanest implementation shape, what it touches, risks, migration steps |
| Engineer | `roundup:engineer` | advisor or builder | Implementation engineer: feasibility, effort, edge cases in the actual code | Effort per proposal, hidden complexity, what existing code constrains the design |
| Security reviewer | `roundup:security-reviewer` | reviewer | Security reviewer: trust boundaries, input handling, authz, secrets | Threats introduced or removed by each option, severity-rated |
| QA | `roundup:qa` | reviewer | QA engineer: how it breaks, what must be verified, test plan | Test cases, regression risks, acceptance checks |
| Devil's advocate | `roundup:devils-advocate` | advisor | Devil's advocate: argue the opposite of the emerging consensus with real evidence | The strongest case against the leading option and what evidence would settle it |
| Domain expert | none | advisor | Replace with the actual domain (payments, accessibility law, data privacy) | Constraints the generalists will miss |

Pick lenses that will disagree. A PM and a UX specialist disagree about scope versus polish; an architect and an engineer disagree about ideal versus incremental. That tension is the product.

## 2. Brief template

Write one file per teammate; `roundup spawn --brief <file>` copies it to `briefs/<name>.md`. Keep it under a page; the teammate can read the code itself.

```markdown
# Brief: <name> (<role>)

## Your role
<Two or three sentences on the lens you bring and what good output from you looks like.>

## The problem
Read `<team dir>/shared/problem.md` first.

## Look at
- <file paths, components, URLs, screenshots, PR numbers>
- <constraints: design system, framework, deadlines, things the user already decided>

## Deliver
1. Within your first turn: your initial position as a message to the lead (`<lead session name>`), under 300 words: recommendation, top reasons, biggest risk, questions for the user.
2. When the lead forwards a disagreement, argue it directly with that teammate by name, two exchanges max, then send the lead your updated position.
3. Final position when asked, in the shape the lead specifies.
Put anything longer than a screen in `<team dir>/shared/<name>-notes.md` and message the path.

## Team
- Lead: `<lead session name>` (orchestrator; makes the final call)
- `<teammate-1>`: <role>
- `<teammate-2>`: <role>
Message any of them with the SendMessage tool, addressed by name.

## Rules
- Read-only during discussion: do not edit project files unless the lead assigns implementation work.
- Disagree with evidence; do not converge to be polite.
- Permission prompts in your pane are yours to surface, not to work around.
- If the user types into your pane and redirects you, tell the lead.
```

## 3. Discussion protocols

**Positions, critique, converge** (default, 2 to 4 advisors, one decision): SKILL.md Phase 3. Typical wall time is a few minutes per round.

**Competing hypotheses** (debugging, root cause): give each teammate one hypothesis to prove and the others to disprove. Ask for evidence, not opinion. The hypothesis that survives the others' attacks wins. Spawn an extra teammate only to test a hypothesis nobody holds.

**Parallel review** (post-implementation): one `reviewer` per lens (security, performance, UX, tests), each told to report only findings in its lens with severity, file, and line. The lead deduplicates and triages. Reviewers do not need to talk to each other.

**Build together** (implementation split): section 6.

Facilitation rules for every protocol:

- Set a budget in every request ("one turn", "two exchanges", "under 300 words"). Sessions without a budget keep going.
- Forward disagreements verbatim rather than paraphrasing; teammates can read each other's words.
- When two teammates agree too quickly, ask one for the strongest argument against the agreement.
- The lead decides. Teams advise; the lead is accountable to the user for the final answer and the implementation.

## 4. Synthesis template

Write `shared/synthesis.md`, then summarize it for the user in prose.

```markdown
# Synthesis: <team> / <topic>

## Decision
<What will be done, in two or three sentences.>

## Why
- <reason tied to a teammate's argument>

## Overruled
- <position> (<teammate>): overruled because <reason>.

## Changes
1. <concrete change, file or component>

## Open questions for the user
- ...

## Team plan
<dismiss | keep-for-review | build-together>, because <reason>.
```

## 5. Retention decision matrix

| Signal | Lean toward |
| :- | :- |
| User said "then you implement it" and the work is small | `dismiss` |
| The change is UI, UX, product-shaped, or an API contract | `keep-for-review` |
| User said "keep them around", "have them review", "build it together" | What the user said |
| Advisors are expensive models the user chose for the debate only | `dismiss`, spawn a cheaper reviewer later |
| Implementation splits into 3+ independent file sets with clear interfaces | `build-together` |
| Work is sequential or same-file heavy | Never `build-together` |

Idle teammates consume no tokens, only screen space and the user's attention, so keeping an advisor for a later review is usually cheaper than re-briefing a new one. Dismiss when the lens is spent, not to tidy up.

## 6. Task board protocol (build-together)

The board lives in `<team dir>/tasks.json`, guarded by a lock, so several sessions can claim concurrently without a double claim.

1. The lead creates the branch first and tells builders to commit to it (or gives each its own worktree through `--cwd` with the `workspace` layout).
2. The lead adds every task with an owner, its files, and dependencies: `roundup task <team> add "Sticky footer in Modal.tsx" --owner modal-fe --files src/components/Modal.tsx --depends 1`. `add` warns when two pending tasks list the same file under different owners; fix the split before anyone starts.
3. Each builder's brief says: `roundup task <team> next --as <name>` to claim the next unblocked task you own, do it, `roundup task <team> complete <id> --as <name> --notes "<what changed>"`, message the lead, repeat until `next` returns nothing. Builders never edit files outside their tasks.
4. The lead watches `roundup task <team> list`, integrates on the branch, runs the tests, and asks a `reviewer` teammate for a pass before opening the PR.
5. `roundup task <team> block <id> --reason "..."` parks a task that needs the user; `unblock` releases it.

When the mod is loaded, every session on the team also has `task_list`, `task_claim_next`, and `task_complete` tools that wrap these commands.

## 7. Worked example: "the modal looks weird"

User: "The UI for this modal looks weird because the primary button is below the fold and the title wraps. Spawn a team with a product manager and a UX specialist to decide what should change, then implement it on a new branch and open a PR."

1. **Frame.** Lead reads the modal component, its styles, and the design system tokens. Writes `shared/problem.md` with the component path, the two symptoms, the constraints, and the decision needed ("what changes, in priority order").
2. **Roster.** `modal-pm` (`roundup:pm`, advisor) and `modal-ux` (`roundup:ux`, advisor). No engineer: the lead has read the code and can judge feasibility. Layout `auto` resolves to `split` inside herdr, otherwise `tab`. Retention `keep-for-review`, because a UI change benefits from the UX lens on the actual result.
3. **Spawn.** `roundup init modal --lead <me> --size 2 ...`, then two `roundup spawn` calls with briefs that point at the component and ask for an initial position.
4. **Facilitate.** PM: fix the fold problem only, the title wrap is cosmetic. UX: both, and move the destructive action out of the primary slot. Lead forwards the conflict; after two exchanges UX concedes the title wrap can follow later, PM accepts the destructive-action change because it is a one-line move. Final positions requested in the fixed shape.
5. **Synthesize.** Decision: sticky footer for actions, destructive action demoted to secondary, title truncation deferred. Written to `shared/synthesis.md`, summarized to the user.
6. **Implement.** New branch, change the component and styles, run the app, screenshot. PR with the synthesis as the description.
7. **Review.** Send both teammates the PR link and the screenshot path; ask for findings in their lens with severity. Address findings, update the PR description.
8. **Close.** `roundup close modal`. Report: decision, PR link, both teammates dismissed after review, artifacts in the team directory.
