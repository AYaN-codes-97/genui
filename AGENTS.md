# AGENTS.md

Instructions for coding agents (GitHub Copilot, cloud agents, reviewers) and humans
working in this repo. This file is a map: it holds the rules and points to the docs.
Read the linked doc before you change the area it covers.

## What this is

genui is a chat UI for an AI-native research portal. A React app streams answers
from our Express server, which calls Gemini. Start with
[docs/architecture/system.md](docs/architecture/system.md).

## Definition of done

1. `npm run verify` passes locally. It runs, in order: typecheck, lint, `check:docs`, tests.
2. The pull request description fills in every section of the evidence pack (below).
3. CI check `verify` is green. `main` is protected: all changes go through a pull request.

Run `npm run verify` after every meaningful change, not only at the end.

## Repository map

| Path | What it is | Read first |
| --- | --- | --- |
| `packages/shared/` | Zod contracts shared by server and web | [stream protocol](docs/architecture/stream-protocol.md) |
| `apps/server/` | Express API (planned) | [ADR 0002](docs/decisions/0002-llm-provider-port.md), [ADR 0003](docs/decisions/0003-server-owns-conversations.md) |
| `apps/web/` | React chat UI (planned) | [ADR 0001](docs/decisions/0001-own-sse-stream-protocol.md) |
| `tools/harness/` | Repo sensors such as `check:docs` | this file |
| `docs/` | Knowledge bundle: architecture, decisions, references | [docs/index.md](docs/index.md) |
| `.github/` | CI workflow, ruleset, PR template | this file |

## Hard rules

* Never push to `main`. Never force-push a shared branch.
* Never weaken a sensor to make it pass. That means: no `.skip`, `.only` or
  `.todo` in tests; no deleting or loosening assertions; no edits to
  `.oxlintrc.json`, `tools/harness/` or `.github/` unless the task is about them.
  If a check seems wrong, stop and say so in the pull request. The `tamper-guard`
  check enforces this; run `npm run guard:tamper` before pushing. Only a human may
  add the `harness-change` label that lets a flagged change through.
* A change to a contract in `packages/shared` needs updated tests in the same pull
  request and an ADR if behaviour changes. See [stream protocol](docs/architecture/stream-protocol.md).
* Only the Gemini adapter imports `@google/genai`. `apps/web` never imports from
  `apps/server`. See [system overview](docs/architecture/system.md).
* Parse data with Zod where it enters the system: HTTP bodies, SSE frames,
  provider responses, environment variables.
* Every new dependency gets one line in the pull request saying why it is needed.
* No secrets in code, tests, docs or logs. Read keys from environment variables.
* TypeScript is run directly by Node: no `enum`, `namespace` or constructor
  parameter properties; relative imports end in `.ts`; no `any`.

## Tests

* Tests sit next to the code: `foo.ts` gets `foo.test.ts`.
* For a bug or a new behaviour, write the failing test first, run it, and see it
  fail for the right reason. Then make it pass.
* Tests must not call real model APIs or the network. Use the fake provider.

## Docs

`docs/` is an [OKF v0.3](https://github.com/open-knowledge-format/open-knowledge-format/blob/main/SPEC.md) bundle with
house rules on top. `npm run check:docs` enforces them and prints a fix for each finding.

* Every `.md` under `docs/` except `index.md` and `log.md` starts with frontmatter:
  `type`, `title`, `description` (one line), `status`, `generated`.
* `type` is one of: Architecture, API Contract, Architecture Decision, External API, Design.
* Every folder with docs has an `index.md` that lists each doc as
  `* [Title](file.md) - description`.
* When you write or substantially change a doc, set
  `generated: { by: github-copilot/<model>, at: <now> }` and `status: draft`.
* Never add a `verified` entry with a `human:` actor. Only humans add those.
* External API docs must cite `sources` (footnotes `[^id]` match `sources[].id`)
  and set `stale_after`.
* When code changes behaviour that a doc describes, update the doc in the same pull request.
* To reverse a decision, write a new ADR. Don't rewrite the old one.

## Evidence pack

Every pull request description uses
[.github/pull_request_template.md](.github/pull_request_template.md):

* **Intent**: the issue or request, in one or two sentences.
* **Verification**: the final summary lines of `npm run verify`, pasted, not paraphrased.
* **Failing first**: the test that failed before the change, and its failure message.
  Write "n/a" with a reason for docs-only or config-only changes.
* **UI evidence**: screenshots (desktop and mobile), accessibility snapshot diff or
  video for UI changes. Otherwise "n/a".
* **Risk**: none, low, medium or high, with one line each for side effects,
  performance, compatibility and security. List any files changed outside the task's scope.
* **Open questions**: anything you assumed or could not decide.

## When to stop and ask

Stop and ask in the pull request or issue, instead of guessing, when:

* the task conflicts with a hard rule or an ADR;
* `npm run verify` still fails after two honest attempts to fix it;
* you need a new dependency, a secret, or a change to CI, the ruleset or the sensors;
* the requirements are ambiguous in a way that changes behaviour users would see.
