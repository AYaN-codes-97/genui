---
type: API Contract
title: Chat stream protocol
description: The SSE events the server sends to the browser while a reply streams.
status: draft
tags: [contract, sse, streaming]
resource: ../../packages/shared/src/stream.ts
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
---

# Chat stream protocol

The source of truth is [stream.ts](../../packages/shared/src/stream.ts). This page
explains it; if the two disagree, the code wins and this page has a bug.

We send our own events, not Gemini's (see [ADR 0001](../decisions/0001-own-sse-stream-protocol.md)).

## Wire format

One SSE frame per event:

```text
event: text.delta
data: {"type":"text.delta","messageId":"...","delta":"Hello"}

```

`event:` repeats the `type` so tools can filter without parsing. `data:` is the
whole event as JSON on one line. Clients parse it with `ChatStreamEventSchema`.

## Events

| `type` | Sent when | Key fields |
| --- | --- | --- |
| `message.started` | The server has stored the user message and created the assistant message | `conversationId`, `userMessageId`, `messageId`, `model`, `createdAt` |
| `text.delta` | The model produced more text | `messageId`, `delta` (append it) |
| `message.completed` | The reply finished normally | `messageId`, `finishReason`, `usage?` |
| `error` | The reply failed | `code`, `message`, `retryable`, `requestId`, `messageId?` |

## Order

`message.started`, then zero or more `text.delta`, then exactly one of
`message.completed` or `error`. An `error` can also arrive alone, before
`message.started`. Nothing follows the final event.

The schemas check each event, not the order. Server tests will enforce the order
once `apps/server` exists.

## Changing this contract

1. Change [stream.ts](../../packages/shared/src/stream.ts) and its tests first.
2. Prefer adding an optional field or a new event over changing an existing one.
   Clients must ignore event types they don't know.
3. Update this page and write an ADR if the change alters behaviour.
