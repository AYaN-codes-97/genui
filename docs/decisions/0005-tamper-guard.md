---
type: Architecture Decision
title: 0005 Tamper guard
description: A required check, run from main's code, that blocks pull requests which weaken tests or sensors unless a human labels them.
status: draft
tags: [adr, harness, ci, security]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-22T07:03:23Z" }
---

# 0005 Tamper guard

## Context

An agent told to make CI green can do it the wrong way: skip a failing test, delete
an assertion, add `@ts-ignore`, or loosen the lint or compiler config. `npm run verify`
can't see this, because the weakened sensor still passes.

## Decision

* A second required check, `tamper-guard`, reads the pull request's diff and flags:
  protected paths (`.github/`, `tools/harness/`, `AGENTS.md`, lint and base compiler
  config, Vitest config), deleted tests, skipped or focused tests, suppressions,
  fewer assertions, compiler checks turned off, and changed sensor scripts.
  Rules live in [tamper.ts](../../tools/harness/src/tamper.ts).
* A human adds the `harness-change` label to let an intended change through. The
  findings still show as warnings.
* The workflow uses the `pull_request` trigger, but runs the guard's code checked out
  from the base commit on `main`. The pull request's files are only read with
  `git diff`; nothing from it is installed or run.
* We don't use `pull_request_target`. It runs with the base repository's write
  token and secrets, which makes any mistake that runs pull request code far more
  dangerous. `pull_request` with read-only permissions is enough to read a diff.
* Bootstrap: when `main` has no guard yet (only for the pull request that adds it),
  the workflow runs the pull request's copy and says so in a warning.

## Consequences

* An agent cannot pass by weakening the checker, because the checker comes from `main`.
* Gap: a pull request can still edit `.github/workflows/tamper-guard.yml` itself, and
  `pull_request` runs the pull request's copy of the workflow. Such an edit is
  always a protected-path change, so review any pull request that touches
  `.github/` line by line. Requiring the workflow from a separate, trusted repository
  would close this gap; we haven't checked whether that is available for a
  personal-account repository.
* The rules are line-based heuristics. They will sometimes flag a fine change (the
  label handles it) and can miss creative weakening (human review still matters).
