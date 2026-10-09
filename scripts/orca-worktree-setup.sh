#!/usr/bin/env bash

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
app_dir="$repo_root/nutrifit-app"
environment_relative_path="nutrifit-app/src/environments/environment.ts"
target_environment="$repo_root/$environment_relative_path"
source_environment=""

if [[ ! -d "$app_dir" ]]; then
  printf 'Cannot find the Angular app at %s\n' "$app_dir" >&2
  exit 1
fi

while IFS= read -r worktree_path; do
  [[ "$worktree_path" == "$repo_root" ]] && continue

  candidate="$worktree_path/$environment_relative_path"
  if [[ -f "$candidate" ]]; then
    source_environment="$candidate"
    break
  fi
done < <(git worktree list --porcelain | sed -n 's/^worktree //p')

if [[ -z "$source_environment" ]]; then
  printf 'Cannot find %s in another worktree. Create it in the main checkout first.\n' \
    "$environment_relative_path" >&2
  exit 1
fi

if [[ ! -e "$target_environment" ]]; then
  cp "$source_environment" "$target_environment"
  printf 'Copied environment.ts from %s\n' "$source_environment"
else
  printf 'Keeping existing environment.ts in %s\n' "$repo_root"
fi

if ! command -v bun >/dev/null 2>&1; then
  printf 'Bun is required but was not found in PATH.\n' >&2
  exit 1
fi

cd "$app_dir"
bun install
