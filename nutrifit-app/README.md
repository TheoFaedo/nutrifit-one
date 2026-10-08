# NutrifitApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.2.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
# Supabase setup

Create a Supabase project, apply the SQL files in `../supabase/migrations`, and
enable Google under **Authentication → Providers**. Add the local app URL and
`/auth/callback` to the Supabase redirect URL allowlist. Copy the project URL
and publishable (or legacy `anon`) key from the Supabase API settings into the
Angular environment files. Copy `src/environments/environment.example.ts` to
`src/environments/environment.ts` for local development, and
`src/environments/environment.production.example.ts` to
`src/environments/environment.production.ts` for production builds. Both real
files are ignored by Git. These values are public browser configuration;
database Row Level Security protects user data. Never put a `service_role` key
in the Angular app.

The initial schema creates each application profile from `auth.users.id` when
Google authentication creates the auth user. The onboarding RPC writes the
initial daily goal and profile's `onboarded` flag in one transaction.

## Application structure

- `src/app/core` contains app-wide services and route guards.
- `src/app/feature` groups pages by user-facing capability; feature routes are
  lazy loaded from `app.routes.ts`.
- `src/app/shared` contains reusable UI elements such as the application brand.
