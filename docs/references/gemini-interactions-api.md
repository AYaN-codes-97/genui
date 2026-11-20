---
type: External API
title: Gemini Interactions API
description: Endpoint, streaming events and state rules of the Gemini API our server adapter calls.
status: draft
tags: [gemini, llm, external-api]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
verified: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
stale_after: "2027-02-20"
sources:
  - id: overview
    resource: https://aistudio.google.com/docs/interactions-overview
    title: Interactions API overview
  - id: streaming
    resource: https://aistudio.google.com/docs/streaming
    title: Streaming
  - id: signatures
    resource: https://aistudio.google.com/docs/thought-signatures
    title: Thought signatures
---

# Gemini Interactions API

Only the Gemini adapter uses this (see [ADR 0002](../decisions/0002-llm-provider-port.md)).
Notes were checked against the sources on 2026-11-20. If the live docs disagree,
trust the docs and update this page.

## Calling it

* REST: `POST https://generativelanguage.googleapis.com/v1beta/interactions` with the
  key in the `x-goog-api-key` header.[^overview]
* SDK: `@google/genai` 2.3.0 or later, `ai.interactions.create({ model, input, ... })`.[^overview]
* `tools`, `system_instruction` and `generation_config` apply to one interaction only.
  Send them again on every turn.[^overview]

## State

* `store` defaults to `true`: Google keeps the interaction (55 days on the paid tier,
  1 day on the free tier).[^overview]
* With `store: false`, `previous_interaction_id` can't be used, so the caller sends the
  full history each turn. That is our mode (see [ADR 0003](../decisions/0003-server-owns-conversations.md)).[^overview]
* In stateless mode, signatures live inside dedicated `thought` steps, so the history
  must include the model's earlier steps as received, thought steps too.[^signatures]
* Implicit caching works in both modes, but stateful mode hits the cache more easily.[^overview]

## Streaming events

Order:[^streaming]

1. `interaction.created`
2. For each step: `step.start`, then one or more `step.delta`, then `step.stop`
3. `interaction.completed`, which carries token usage
4. A final `event: done` frame with `data: [DONE]`

`interaction.status_update` may appear between steps.

An `error` event carries `{ "error": { "message", "code" } }`.[^streaming]

`step.delta` types by step:[^streaming]

| Step | Delta types |
| --- | --- |
| `model_output` | text, image, audio |
| `thought` | `thought_summary` (only when `thinking_summaries` is on), `thought_signature` |
| `function_call` | `arguments_delta` |

The `thought_signature` delta is the last one before that step's `step.stop`.[^streaming]

Log and skip event types and delta types you don't recognise; new ones get added.[^streaming]

## What the adapter maps

| Gemini | Our [stream protocol](../architecture/stream-protocol.md) |
| --- | --- |
| first event of the call | `message.started` |
| `model_output` text delta | `text.delta` |
| `interaction.completed` | `message.completed` with usage |
| `error` event, or a failed request | `error` |
| thought and function-call steps | kept in stored history, not sent to the browser |

[^overview]: Interactions API overview.
[^streaming]: Streaming.
[^signatures]: Thought signatures.
