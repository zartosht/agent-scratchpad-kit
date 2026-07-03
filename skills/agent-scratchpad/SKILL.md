---
name: agent-scratchpad
description: Use when working on complex coding tasks, refactors, migrations, debugging sessions, investigations, context compaction, or handoffs. Maintains a repo-local scratchpad for objective, plan, decisions, files inspected, files changed, commands run, validation, blockers, next steps, and handoff notes.
license: MIT
metadata:
  version: "0.1.0"
---

# Skill: Agent Scratchpad

**Use a local scratchpad file to maintain durable working memory across context windows, sessions, and agent handoffs.**

## When to use this skill

Use this skill whenever a task involves:

- Complex multi-step coding, refactors, or migrations
- Debugging or investigation spanning multiple turns
- Context compaction (approaching context window limits)
- Handoffs between sessions or between different agents
- Any task where you might "lose your place" if context is reset

## Core convention

In the repository you're working in (after installing this kit), use:

| File | Purpose | Tracked? |
|---|---|---|
| `.agent/SCRATCHPAD.local.md` | Live task notes for the current session | **No** (git-ignored) |
| `.agent/SCRATCHPAD.template.md` | Blank template committed to the repo | Yes |
| `.agent/README.md` | Instructions for using the scratchpad | Yes |

- **Live task state goes in `.agent/SCRATCHPAD.local.md`** — this file is git-ignored and never committed.
- **Stable project rules and templates are tracked** — `.agent/SCRATCHPAD.template.md` and `.agent/README.md` are committed.
- Keep live task notes separate from stable project rules.

## How to use

1. Check whether `.agent/SCRATCHPAD.local.md` exists. If not, copy `.agent/SCRATCHPAD.template.md` to `.agent/SCRATCHPAD.local.md`.
2. Read the scratchpad at the start of each session to restore context.
3. Update the scratchpad continuously as you work.
4. At the end of a session or before handing off, fill in the **Handoff notes** section.

## What to record

Record the following in the scratchpad:

- **Current objective** — what you are trying to accomplish right now.
- **Context snapshot** — relevant background: repo structure, key files, constraints.
- **Current plan** — the ordered steps you intend to take.
- **Decisions and assumptions** — choices made and why; assumptions that could be wrong.
- **Files inspected** — files you have read or examined.
- **Files changed** — files you have modified, with a brief description of each change.
- **Commands run** — commands executed and their summarized results.
- **Validation results** — outcome of tests, lints, builds, or manual checks.
- **Open questions or blockers** — unresolved issues or things you are unsure about.
- **Next steps** — what to do next, in order.
- **Handoff notes** — what the next session or agent needs to know to continue.

## What NOT to record

- Secrets, credentials, tokens, API keys, or passwords.
- Personal data or PII.
- Huge raw log dumps — summarize instead.
- Unrelated context that will not help future sessions.

## Summarize, don't dump

When recording command output, write a one- or two-line summary of what happened and what it means. Do not paste hundreds of lines of raw output.

**Bad:**
```
[full output of npm install with 200 lines of dependency tree]
```

**Good:**
```
Ran `npm install` — 47 packages installed, 0 vulnerabilities.
```

## Checking `.gitignore`

Before starting work, confirm that `.agent/SCRATCHPAD.local.md` is listed in `.gitignore`. If it is not, add it. Never commit the local scratchpad file.
