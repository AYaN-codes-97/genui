---
type: Architecture Decision
title: 0003 Server owns conversations
description: The server stores history and calls Gemini statelessly with the full history each turn.
status: draft
tags: [adr, state, gemini]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
---

# 0003 Server owns conversations

## Context

Gemini can store conversation state for us (`store: true` plus
`previous_interaction_id`). That would make Google the source of truth for our
history: retention is limited, and we couldn't list, edit or migrate conversations.

## Decision

* The server is the source of truth. It stores conversations behind a repository
  interface; Phase 1 uses an in-memory implementation.
* Each turn calls Gemini with `store: false` and the full history, including the
  model's own earlier steps exactly as returned (thought steps carry signatures the
  model needs back).
* Tools, system instruction and generation config are sent again every turn,
  because they apply per call.

## Consequences

* We control retention and can swap storage later without touching routes.
* Requests grow with the conversation. Gemini's implicit caching still works in
  stateless mode, but stateful mode hits the cache more easily, so we may pay more
  per turn. Revisit if token cost becomes a problem.
* The history we store must keep provider steps verbatim, not only display text.
  See the [Gemini Interactions API reference](../references/gemini-interactions-api.md).
