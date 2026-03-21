# agent-loop-flow

[![npm version](https://img.shields.io/npm/v/agent-loop-flow.svg)](https://www.npmjs.com/package/agent-loop-flow)
[![license](https://img.shields.io/npm/l/agent-loop-flow.svg)](https://github.com/dyoshikawa-claw/agent-loop-flow/blob/main/LICENSE)

AI coding agent utility CLI that orchestrates prompt flows with transitions and loops, defined in JSONC files.

## Overview

Agent-loop-flow lets you compose agent workflows by chaining prompts:

```
prompt A -> prompt B -> prompt C ...
```

Define flows in JSONC files with support for:

- **Sequential execution** -- run prompts in order
- **Flat transition rules** -- route execution via `next` rules on steps (no nesting for if/else)
- **Loops** -- while-loops and for-each iteration
- **JSON Schema validation** -- validated flow definitions with IDE autocompletion

## Quick Start

### Install

```bash
npm install -g agent-loop-flow
```

Or use with npx:

```bash
npx agent-loop-flow run my-flow.jsonc
```

For use as a library:

```bash
npm install agent-loop-flow
```

### Define a Flow

Create a `.jsonc` file (e.g., `my-flow.jsonc`):

```jsonc
{
  "$schema": "./flow-schema.json",
  "name": "my-flow",
  "description": "Analyze and fix code",
  "defaultTool": "opencode",
  "defaultModel": "github-copilot/claude-opus-4.6",
  "variables": {
    "targetFile": "src/index.ts",
    "hasIssues": true,
  },
  "steps": [
    {
      "type": "skill",
      "name": "analyze",
      "skill": "code-analysis",
      "prompt": "Analyze {{targetFile}} for issues",
      "next": [{ "condition": "hasIssues", "step": "fix" }, { "step": "done" }],
    },
    {
      "type": "skill",
      "name": "fix",
      "skill": "code-fix",
      "prompt": "Fix issues found in {{targetFile}}:\n{{previousResult.output}}",
    },
    {
      "type": "skill",
      "name": "done",
      "skill": "reporter",
      "prompt": "Report that {{targetFile}} is clean",
    },
  ],
}
```

### Run a Flow

```bash
# Run a flow
agent-loop-flow run my-flow.jsonc

# Run with variables
agent-loop-flow run my-flow.jsonc --var targetFile=src/app.ts

# Validate without executing
agent-loop-flow validate my-flow.jsonc
```

## Flow Definition

### Step Types

#### Skill Step

Executes a single skill with a prompt. Supports `{{variable}}` interpolation and optional `next` transition rules.

```jsonc
{
  "type": "skill",
  "name": "analyze-code",
  "skill": "code-analysis",
  "prompt": "Analyze {{targetFile}}",
  "next": "verify-step", // unconditional jump
}
```

#### Transition Rules (`next`)

The `next` field controls which step runs after the current one. It can be:

- A **string** for an unconditional jump: `"next": "step-name"`
- An **array of rules** for conditional branching:

```jsonc
{
  "type": "skill",
  "name": "check",
  "skill": "checker",
  "prompt": "Check code",
  "next": [
    { "condition": "hasIssues", "step": "fix-issues" },
    { "step": "report-clean" }, // default (else) branch
  ],
}
```

Supported conditions:

- Variable truthiness: `"variableName"`
- Equality: `"variable == \"value\""`
- Inequality: `"variable != \"value\""`
- Last result: `"lastResult.success"`
- Output contains: `"lastResult.output contains \"error\""`

If no `next` is specified (or no rule matches and there is no default), the engine falls through to the next step in array order.

#### While Loop

Repeats steps while a condition is true.

```jsonc
{
  "type": "while-loop",
  "name": "retry-loop",
  "condition": "shouldRetry",
  "maxIterations": 5,
  "steps": [
    // steps to repeat
  ],
}
```

#### For-Each Loop

Iterates over items in a variable.

```jsonc
{
  "type": "for-each",
  "name": "process-files",
  "items": "fileList",
  "as": "currentFile",
  "steps": [
    {
      "type": "skill",
      "name": "process",
      "skill": "processor",
      "prompt": "Process {{currentFile}}",
    },
  ],
}
```

### Variables

Variables can be defined at the flow level and overridden via CLI:

```jsonc
{
  "variables": {
    "targetFile": "src/index.ts",
    "mode": "strict",
  },
}
```

```bash
agent-loop-flow run flow.jsonc --var targetFile=src/app.ts --var mode=lenient
```

#### Previous Result Variables

Each skill step can reference the previous step's output using `{{previousResult.output}}` or the flat camelCase form `{{previousResultOutput}}`. All fields from the previous result are available:

```jsonc
{
  "steps": [
    {
      "type": "skill",
      "name": "analyze",
      "skill": "code-analysis",
      "prompt": "Analyze {{targetFile}}",
    },
    {
      "type": "skill",
      "name": "fix",
      "skill": "code-fix",
      "prompt": "Fix the issues:\n{{previousResult.output}}",
    },
  ],
}
```

Available variables: `previousResult.output`, `previousResult.success`, `previousResult.stepName`, `previousResult.skill`, `previousResult.error` (and their flat camelCase equivalents like `previousResultOutput`).

## Programmatic API

```typescript
import { parseFlowFile, createFlowEngine } from "agent-loop-flow";
import type { SkillExecutor } from "agent-loop-flow";

// Define how skills are executed
const skillExecutor: SkillExecutor = async ({ skill, prompt, variables }) => {
  // Integrate with OpenCode SDK, Claude Agent SDK, etc.
  return { output: "result", success: true };
};

// Parse and run a flow
const flow = await parseFlowFile({ filePath: "my-flow.jsonc" });
const engine = createFlowEngine({ skillExecutor });
const result = await engine.executeFlow({ flow });

console.log(result.success);
console.log(result.results);
```

## Examples

See the `examples/` directory for sample flow definitions:

- `simple-sequential.jsonc` -- Basic prompt chain
- `conditional-fix.jsonc` -- Conditional branching via next rules
- `loop-processing.jsonc` -- For-each and while loops

## Development

```bash
pnpm install
pnpm check     # fmt + lint + typecheck
pnpm test      # run tests
pnpm build     # build for distribution
```

## License

MIT
