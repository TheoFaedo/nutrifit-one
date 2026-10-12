---
name: code-simplifier
description: >
  Simplify recently written or modified code for clarity, consistency, reuse, and
  maintainability without changing behavior. Apply three review lenses: reuse,
  quality, and efficiency. Use when the user asks to simplify, clean up, refine,
  polish, or make code clearer; after a feature, bug fix, or refactor leaves code
  working but harder to read; or when changed code feels too nested, repetitive,
  clever, or inconsistent with the surrounding project style.
---

# Code Simplifier

Simplify only the relevant changed code unless the user explicitly asks for a broader sweep. Preserve behavior, outputs, error semantics, side effects, and public interfaces.

Default to a single-agent simplification pass. Use `spawn_agent` only when the user explicitly asks for delegation, parallel subagents, or a multi-agent review and the touched scope is broad enough to benefit.

## Workflow

1. Identify the scope.
- Prefer the files or hunks changed in the current task.
- If the scope is unclear, inspect the named function, file, or recent diff.
- Avoid unrelated cleanup outside the touched area.

2. Read the project's local conventions.
- Check `AGENTS.md`, nearby code, formatter and lint rules, and type patterns.
- Match the repository's style instead of forcing a generic one.
- Reuse existing helpers before introducing new abstractions or dependencies.

3. Decide whether to delegate.
- Keep the immediate blocking work local. Form a short plan before spawning anything.
- Do not delegate small, tightly coupled, or urgent blocking work where your next step depends on the answer.
- If the user explicitly asks for parallelism and the work is broad enough, use `spawn_agent` for bounded subtasks that can run in parallel with your local work.
- Prefer narrow prompts and explicit file or symbol scope over copying the full thread context. Use `fork_context` only when the subagent truly needs the same conversation history.
- Prefer `explorer` agents for read-heavy simplification analysis. Reserve `worker` agents for implementation only when the write scope can be split into disjoint files or modules.

4. Review the code through three simplification lenses.
- Reuse: prefer existing helpers, utilities, and local patterns before adding new abstractions; remove duplication when the shared shape is stable.
- Quality: improve readability, naming, branching, cohesion, and type clarity; preserve logging, validation, and error semantics.
- Efficiency: remove unnecessary work in the touched code such as redundant passes, allocations, awaits, or lookups when the improvement is obvious and behavior stays identical.
- If the lenses conflict, prefer behavioral safety and readability over extra DRYing or micro-optimizations.

5. Simplify with restraint.
- Flatten unnecessary nesting and branching.
- Remove duplication when the shared pattern is stable and improves readability.
- Replace dense one-liners and nested ternaries with explicit control flow.
- Prefer clear names, direct data flow, and small cohesive helpers.
- Keep comments only when they explain non-obvious intent.
- Preserve logging, validation, and error handling behavior.

6. Verify before finishing.
- Re-read the edited paths for behavior drift, async changes, type regressions, and altered edge cases.
- Run the smallest relevant validation available when practical.
- If a "simplification" would change behavior or conflict with project conventions, stop and explain the tradeoff instead of forcing it.

## Subagent Strategy

- Apply all three lenses inline by default.
- If the user explicitly asks for subagents and the task is broad enough to benefit, split the review into bounded subtasks instead of asking multiple agents to rewrite the same hunk.
- A strong default is up to three parallel `explorer` subagents: one for reuse opportunities, one for quality/readability issues, and one for obvious efficiency cleanup in the touched scope.
- Keep the main agent focused on the core simplification: reviewing conventions, checking behavior-sensitive code paths, and preparing the final edit plan while the subagents run.
- Ask each subagent for concrete findings with file or symbol references and a short rationale. Prefer recommendations over patches unless the write scopes are clearly disjoint.
- Call `wait_agent` sparingly. Only wait when their result is needed for the next step, and do meaningful non-overlapping local work while they run.
- Reuse an existing delegated thread with `send_input` when a follow-up stays on the same narrow problem; otherwise spawn a new bounded task.
- Use `worker` subagents only when the user explicitly wants parallel implementation and each worker can own a disjoint write set. Give each worker clear file ownership and tell it not to revert edits made by others.
- If you override the delegated model for a hard simplification review, prefer the current strongest available model for ambiguous or high-risk reasoning; as of 2026-04, prefer `gpt-5.5` when available and fall back to `gpt-5.4` when it is not.
- Use `gpt-5.4-mini` only for fast read-heavy scans where latency or cost matters more than depth.
- Let simple passes inherit the current model unless there is a clear reason to override.
- Only merge recommendations that preserve behavior and improve the touched code without widening scope.
- Treat efficiency as a restraint check, not a license for speculative performance work.

## Guardrails

- Do not change public APIs, storage formats, or user-visible text unless explicitly requested.
- Do not widen a refactor just because more cleanup is possible.
- Do not optimize for fewer lines at the expense of clarity.
- Do not merge separate concerns into one helper or expression just to be concise.
- Keep existing import, module, and file-organization conventions.
- Do not spawn subagents just because the environment supports them. Use them only for clear, parallelizable subtasks.
- Do not duplicate work between the main agent and subagents.
- Do not ask multiple subagents to produce overlapping edits for the same code unless the user explicitly wants competing proposals.
- Do not keep polling or waiting on subagents by reflex. If you are not blocked, keep working locally.

## Good Triggers

- `Simplify this code`
- `Clean up this implementation`
- `Make this clearer without changing behavior`
- `Polish the refactor`
- `Reduce the complexity in this function`
- `Review this refactor for reuse, quality, and efficiency`
- `Review this refactor in parallel with subagents`
- `Use subagents to scan this diff for reuse, quality, and efficiency`

## Expected Output

- Make the code changes directly when the request is actionable.
- Call out any uncertainty that could affect behavior before editing.
- Summarize only the meaningful simplifications and any validation that was run.
