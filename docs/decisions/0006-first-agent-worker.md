---
type: Architecture Decision
title: 0006 First agent worker
description: One implementer agent works from task issues inside the existing gate, and every pull request records its outcome.
status: draft
tags: [adr, agents, factory]
generated: { by: github-copilot/claude-opus-5.5, at: "2026-11-22T07:42:08Z" }
---

# 0006 First agent worker

## Context

Phase 0 built the checks and the gate: `npm run verify`, `tamper-guard`, and a ruleset
that requires both. Nothing produces work yet. Uber reports that the cost of agent work
should be measured per outcome (cost per merged pull request, revert rate), and that
agents spend most of their turns looking for context.

## Decision

* **One worker, one role.** The [implementer profile](../../.github/agents/implementer.agent.md)
  does one task per issue: failing test first, loop on `npm run verify`, run
  `npm run guard:tamper`, then open a pull request. After two failed CI rounds it stops and
  marks the pull request `blocked`.
* **Work enters through a task issue** ([template](../../.github/ISSUE_TEMPLATE/task.yml)) with
  intent, acceptance criteria, out-of-scope items and risk.
* **The environment is prepared, not discovered.**
  [copilot-setup-steps.yml](../../.github/workflows/copilot-setup-steps.yml) installs Node and
  dependencies and runs `verify`, so the agent starts from a known-good state instead of
  guessing setup commands.
* **Every pull request records its outcome**: result (success, flawed, blocked, manual),
  agent and model, CI rounds and time to green, plus papercuts. This is the raw data for
  cost per merged pull request and for improving the instructions.
* **No model is pinned yet.** The profile uses the default model. A model will be chosen
  per role once a small benchmark of real tasks exists (golden tasks, Phase 2).

## Consequences

* The agent gets no new permissions: it works through pull requests that must pass the
  same required checks as a human's.
* The setup steps only apply when the cloud agent runs on GitHub Actions, and only once
  the file is on `main`. Whether the company Copilot Business seat may use the cloud agent
  on this personal repository is still to be confirmed. If it can't, the same profile and
  checks apply to agent mode in VS Code.
* Outcome data is typed by hand into each pull request for now. A later workflow can
  collect it into a ledger.
