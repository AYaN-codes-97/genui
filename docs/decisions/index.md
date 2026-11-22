# Decisions

Architecture Decision Records. Numbered, never renumbered. To reverse one, write a
new ADR, then set the old one to `status: deprecated` with `superseded_by`.

* [0001 Own SSE stream protocol](0001-own-sse-stream-protocol.md) - The browser receives our own stream events over fetch, not provider events or EventSource.
* [0002 LLM provider port](0002-llm-provider-port.md) - The server talks to models through one interface; only the Gemini adapter imports the SDK.
* [0003 Server owns conversations](0003-server-owns-conversations.md) - The server stores history and calls Gemini statelessly with the full history each turn.
* [0004 TypeScript 7 and Oxlint](0004-typescript-7-and-oxlint.md) - Native TypeScript 7 for type checks, Oxlint with tsgolint for type-aware linting.
* [0005 Tamper guard](0005-tamper-guard.md) - A required check, run from main's code, that blocks pull requests which weaken tests or sensors unless a human labels them.
* [0006 First agent worker](0006-first-agent-worker.md) - One implementer agent works from task issues inside the existing gate, and every pull request records its outcome.
