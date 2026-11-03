#!/usr/bin/env python3
"""Format changed repository files when a Codex turn stops."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


FORMATTABLE_SUFFIXES = {
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".jsonc",
    ".less",
    ".md",
    ".mjs",
    ".scss",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}
ENVIRONMENT_DIRECTORY = Path("nutrifit-app/src/environments")


def git_paths(root: Path, *args: str) -> set[Path]:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        check=True,
        capture_output=True,
    )
    return {Path(path.decode()) for path in result.stdout.split(b"\0") if path}


def run(command: list[str], root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=root, text=True, capture_output=True, check=False)


def report(message: str, *, continue_turn: bool = False) -> None:
    response: dict[str, object] = {"systemMessage": message}
    if continue_turn:
        response["decision"] = "block"
        response["reason"] = message
    print(json.dumps(response))


def main() -> int:
    root_result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )
    root = Path(root_result.stdout.strip())
    changed = git_paths(root, "diff", "--name-only", "-z", "HEAD")
    changed.update(git_paths(root, "ls-files", "--others", "--exclude-standard", "-z"))

    targets = sorted(
        path
        for path in changed
        if path.suffix.lower() in FORMATTABLE_SUFFIXES
        and not path.is_relative_to(ENVIRONMENT_DIRECTORY)
        and (root / path).is_file()
    )
    if not targets:
        print("{}")
        return 0

    prettier = root / "nutrifit-app/node_modules/.bin/prettier"
    if not prettier.is_file():
        report("Prettier is unavailable; changed files were not formatted.", continue_turn=True)
        return 0

    format_result = run([str(prettier), "--write", *map(str, targets)], root)
    if format_result.stdout:
        print(format_result.stdout, file=sys.stderr, end="")
    if format_result.stderr:
        print(format_result.stderr, file=sys.stderr, end="")
    if format_result.returncode:
        report("Prettier failed. Resolve the formatting error before ending the turn.", continue_turn=True)
        return 0

    app_typescript = [
        path
        for path in targets
        if path.suffix.lower() in {".ts", ".tsx"}
        and path.is_relative_to(Path("nutrifit-app"))
    ]
    if not app_typescript:
        print("{}")
        return 0

    lint_result = run(["bun", "run", "lint"], root / "nutrifit-app")
    output = "\n".join(part for part in (lint_result.stdout, lint_result.stderr) if part).strip()
    if output:
        print(output, file=sys.stderr)
    if lint_result.returncode:
        report(
            "Formatting ran, but lint found issues (including any `if` without braces). Fix them before ending the turn.",
            continue_turn=True,
        )
        return 0

    print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
