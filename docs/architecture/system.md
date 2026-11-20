---
type: Architecture
title: System overview
description: Workspace layout, what exists today, and the dependency rules between packages.
status: draft
tags: [architecture, workspaces]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
---

# System overview

genui is a chat UI for an AI-native research portal (reports, webinars, videos,
events). A browser app talks to our own server, and the server talks to Gemini.
The browser never talks to Gemini directly.

```text
apps/web (React) --HTTP + SSE--> apps/server (Express) --LlmProvider port--> Gemini adapter --> Gemini Interactions API
        \                               /
         +------ packages/shared ------+   (Zod contracts both sides import)
```

## Layout

| Path | Status | Purpose |
| --- | --- | --- |
| [packages/shared](../../packages/shared/src/index.ts) | built | Zod schemas and types for messages, API bodies, errors and stream events. No build step: consumers import the `.ts` source. |
| `apps/server` | planned | Express 5 API. Owns conversations and streams replies as SSE. |
| `apps/web` | planned | React + Vite + Tailwind chat UI. |
| [tools/harness](../../tools/harness/src/check-docs.ts) | built | Repo sensors, starting with `check:docs`. |

## Dependency rules

* `packages/shared` imports nothing from the repo. Both apps import it.
* `apps/web` never imports from `apps/server`, and the reverse. They meet only
  through `packages/shared` contracts.
* Only the Gemini adapter in `apps/server` imports `@google/genai`
  (see [ADR 0002](../decisions/0002-llm-provider-port.md)).
* Data crossing a boundary (HTTP body, SSE frame, provider response, env vars)
  is parsed with Zod at that boundary.

## Toolchain

Node 24 runs TypeScript directly, so there is no compile step. TypeScript 7 only
type-checks. Oxlint does type-aware linting. Vitest runs `*.test.ts` files placed
next to the code they test. See [ADR 0004](../decisions/0004-typescript-7-and-oxlint.md).
