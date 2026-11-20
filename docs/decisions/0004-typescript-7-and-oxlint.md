---
type: Architecture Decision
title: 0004 TypeScript 7 and Oxlint
description: Native TypeScript 7 for type checks, Oxlint with tsgolint for type-aware linting.
status: stable
tags: [adr, toolchain]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
---

# 0004 TypeScript 7 and Oxlint

## Context

Agents run checks many times per task, so slow checks slow the whole factory.
TypeScript 7 is the native (Go) compiler and is much faster than TypeScript 5.
typescript-eslint does not support it (its peer range stops below 6.1).

## Decision

* TypeScript 7 only type-checks (`noEmit`). Node 24 runs `.ts` files directly by
  stripping types, so code must use erasable syntax only: no `enum`, `namespace`
  or constructor parameter properties, and imports use explicit `.ts` extensions.
* Oxlint with `oxlint-tsgolint` does linting, including type-aware rules such as
  `no-misused-promises` and `switch-exhaustiveness-check`. Rules live in
  [.oxlintrc.json](../../.oxlintrc.json).
* Warnings count as failures (`--deny-warnings`).

## Consequences

* `npm run verify` stays fast enough to run after every change.
* Some typescript-eslint rules have no Oxlint equivalent yet. When one matters,
  add a test or a harness sensor instead of an unenforced convention.
