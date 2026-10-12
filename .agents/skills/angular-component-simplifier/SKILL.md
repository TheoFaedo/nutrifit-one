---
name: angular-component-simplifier
description: Simplify Angular components by clarifying responsibilities and extracting cohesive child components, services, or other focused units while preserving behavior. Use when an Angular component is hard to understand, handles unrelated UI concerns, or has a template or class that would benefit from a careful responsibility split.
---

# Angular Component Simplifier

Refactor the requested Angular code so each unit has a clear responsibility and the component structure is easier to understand. Preserve the existing user-facing behavior, accessibility, data flow, and public interfaces unless the user asks for a behavior change.

## Workflow

1. Read the repository's `AGENTS.md` files, the target component and its template/styles, and nearby components that establish local patterns. Check the installed Angular version before relying on version-specific APIs.
2. Identify the distinct responsibilities in the current code. Look for separate visual regions with independent state or interactions, repeated UI with the same purpose, and non-UI work that belongs in a service or pure helper. Explain the proposed boundary briefly when it is not obvious.
3. Extract only units with a cohesive purpose and a useful boundary. Keep a component together when splitting it would create mostly pass-through inputs and outputs, tightly coupled state, or extra indirection. Do not split solely to reduce line count.
4. Give extracted components focused names and explicit contracts. Prefer signal `input()` and `output()` APIs when supported by the project's Angular version and conventions. Keep state with the unit that owns it; keep shared orchestration in the parent. Use a service for reusable or non-visual application logic, and a pure helper for stateless transformations.
5. Preserve template semantics, styling, responsive behavior, keyboard interaction, focus behavior, and accessible names and relationships. Avoid duplicating state between parent and child. Keep templates declarative and move complex expressions into typed component members or pure helpers.
6. Update imports, styles, and focused specs affected by the extraction. Do not add unrelated cleanup or new dependencies.
7. Review the diff for behavior drift, unclear ownership, unnecessary forwarding, and accessibility regressions. Run the repository's relevant lint/build checks when practical; run tests when requested or when needed to verify a meaningful behavior-sensitive change.

## Angular conventions

- Follow local guidance first. In this repository, prefer standalone components, signals for local state, native template control flow (`@if`, `@for`, `@switch`), strict types, and accessible markup.
- Do not set `standalone: true` or explicitly set `OnPush` where the repository's Angular version makes these defaults.
- Prefer inline templates for small components; keep larger templates and styles beside their component using the repository's filename conventions.
- Use `computed()` for derived state and keep state updates predictable. Avoid `any`, `ngClass`, and `ngStyle` where repository rules prohibit them.
- Keep components focused without fragmenting a single interaction across components that must constantly coordinate.

## Expected result

Make the refactor directly in the requested scope. In the final summary, name the responsibilities that moved and their new owners, and report the checks that were run or any verification that could not be completed.
