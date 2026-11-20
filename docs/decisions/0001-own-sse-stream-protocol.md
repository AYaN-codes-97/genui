---
type: Architecture Decision
title: 0001 Own SSE stream protocol
description: The browser receives our own stream events over fetch, not provider events or EventSource.
status: stable
tags: [adr, sse, streaming]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-20T04:02:58Z" }
---

# 0001 Own SSE stream protocol

## Context

Gemini streams its own event types (`step.delta`, `interaction.completed`, and so
on). If the browser consumed those directly, every provider change would break the
UI. Also, the browser `EventSource` API only supports GET, and a chat turn needs a
POST body.

## Decision

* The server translates provider events into the four events in the
  [chat stream protocol](../architecture/stream-protocol.md).
* The browser reads the stream with `fetch` and `ReadableStream`, not `EventSource`.
* When the client disconnects (`res.on('close')`), the server aborts the provider
  call so we stop paying for tokens nobody reads.

## Consequences

* The UI depends only on `@genui/shared`. A provider swap touches only the server adapter.
* We write a small SSE parser on the client instead of using `EventSource`.
  `EventSource`'s automatic reconnect is not wanted anyway: a half-finished reply
  can't simply resume.
