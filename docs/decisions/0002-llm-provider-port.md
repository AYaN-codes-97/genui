---
type: Architecture Decision
title: 0002 LLM provider port
description: The server talks to models through one interface; only the Gemini adapter imports the SDK.
status: draft
tags: [adr, llm, ports-and-adapters]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
---

# 0002 LLM provider port

## Context

Model APIs change often. Tests that call a real model are slow, cost money and
give different answers each run, so they can't be a reliable pass/fail signal.

## Decision

* `apps/server` defines an `LlmProvider` interface (a "port"). Route handlers
  depend on that interface only.
* A Gemini adapter implements it. It is the only file allowed to import `@google/genai`.
* Tests use a fake provider that streams scripted chunks, including failures.

## Consequences

* Server tests are fast, free and deterministic.
* Gemini-specific details (step types, thought signatures, usage fields) stay inside
  one adapter. See the [Gemini Interactions API reference](../references/gemini-interactions-api.md).
* Real-model checks become a separate, explicitly run eval suite, not part of `npm run verify`.
