# Agent Scratchpad

This directory contains files for the **Agent Scratchpad** workflow — durable working memory for coding agents.

## Files

| File | Purpose | Tracked? |
|---|---|---|
| `README.md` | These instructions | Yes |
| `SCRATCHPAD.template.md` | Blank template | Yes |
| `SCRATCHPAD.local.md` | Your live task notes | **No** (git-ignored) |

## How to use

1. Copy `SCRATCHPAD.template.md` to `SCRATCHPAD.local.md`:
   ```bash
   cp .agent/SCRATCHPAD.template.md .agent/SCRATCHPAD.local.md
   ```
2. Fill in your current objective, plan, and context.
3. Update the scratchpad as you work.
4. Before handing off, fill in the **Handoff notes** section.

## Rules

- `.agent/SCRATCHPAD.local.md` is git-ignored — never commit it.
- Never write secrets, credentials, tokens, or personal data into the scratchpad.
- Summarize command output instead of pasting raw logs.

## Why a scratchpad?

Coding agents lose state between context windows, sessions, and handoffs. The scratchpad gives the agent a stable file it can read and write throughout a task, preserving plans, decisions, and progress across resets.
