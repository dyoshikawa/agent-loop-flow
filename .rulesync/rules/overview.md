---
root: true
targets: ["*"]
description: "agent-loop-flow project overview and development guidelines for AI agent flow orchestration CLI"
globs: ["**/*"]
cursor:
  alwaysApply: true
  description: "agent-loop-flow project overview and development guidelines for AI agent flow orchestration CLI"
  globs: ["*"]
---

# Agent-loop-flow Project Overview

This is agent-loop-flow, a CLI tool for orchestrating AI coding agent workflows. Define prompt flows with step transitions and loops via JSONC configuration files.

## Key Concepts

- **Flow**: A sequence of prompts executed in order (prompt A → prompt B → ...)
- **Step Transitions**: Branch execution via `next` rules based on runtime conditions
- **Loops**: Iterate over tasks until a condition is met
- **JSONC Definition**: Flows are defined in `.jsonc` files with JSON Schema validation
- **SDK Integration**: Uses OpenCode SDK and Claude Agent SDK internally

## Development Guidelines

- Read `README.md` and `docs/**/*.md` for specification details.
- Manage runtimes and package managers with `mise.toml`.
- Run `pnpm cicheck` before committing to verify code quality.
- Do not use `--no-verify` option for git commits.
