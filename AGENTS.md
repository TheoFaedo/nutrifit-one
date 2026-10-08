# Repository Guidelines

## Project Structure & Module Organization

The Angular application is in `nutrifit-app/`. Feature pages live under `src/app/feature/` (currently auth, journal, and onboarding); shared UI, core services, guards, and models live in their corresponding `shared/` and `core/` folders. App-wide routes and configuration are in `src/app/`. Global styles and static files are in `src/` and `public/`. Database schema changes belong in `supabase/migrations/`; product, architecture, and database notes are in `docs/`.

## Build, Test, and Development Commands

Run commands from `nutrifit-app/` using Bun, as declared by `package.json`:

- `bun install` installs dependencies from `bun.lock`.
- `bun run start` serves the app locally with Angular CLI.
- `bun run build` builds the production application.
- `bun run watch` continuously builds with development settings.
- `bun run test` runs the Angular test suite (Vitest).

## Coding Style & Naming Conventions

Follow the TypeScript and Angular guidance in `nutrifit-app/AGENTS.md`: use strict types, standalone components, signals for local state, lazy feature routes, and accessible markup. Keep components focused. Use kebab-case filenames with role suffixes such as `login.component.ts` and `auth.service.ts`; keep a component’s HTML and LESS alongside its TypeScript when they are separate files. Match the existing two-space formatting and LESS styling conventions. Use native Angular template control flow (`@if`, `@for`) and avoid `any`.

## Testing Guidelines

Place tests beside the code they cover with the `.spec.ts` suffix (for example, `src/app/app.spec.ts`). Run `bun run test` from `nutrifit-app/` after changing application behavior. Add or update tests for meaningful behavior changes; keep tests deterministic and focused.

## Commit & Pull Request Guidelines

Recent commits use short Conventional Commit subjects such as `feat: added onboarding`, `chore: init angular project and db`, and `spec: added specs`. Use a type prefix and concise imperative description. Pull requests should explain the user-facing change, link relevant issues or specs, note database migrations or configuration changes, and include screenshots for visible UI changes. State the checks you ran.

## Security & Configuration

Use the environment example files under `nutrifit-app/src/environments/` as templates. Keep real credentials and secrets out of commits. Put database changes in ordered Supabase migration files and document relevant schema updates in `docs/DATABASE.md`.
