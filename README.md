# agent-loop-flow

[![npm version](https://img.shields.io/npm/v/agent-loop-flow.svg)](https://www.npmjs.com/package/agent-loop-flow)
[![license](https://img.shields.io/npm/l/agent-loop-flow.svg)](https://github.com/dyoshikawa-claw/agent-loop-flow/blob/main/LICENSE)

AI coding agent utility CLI that orchestrates skill flows with conditionals and loops, defined in JSONC files.

## Overview

Agent-loop-flow lets you compose agent workflows by chaining skills:

```
skill A -> skill B -> skill C ...
```

Define flows in JSONC files with support for:

- **Sequential execution** -- run skills in order
- **Conditional branching** -- route execution based on conditions
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
  "variables": {
    "targetFile": "src/index.ts",
  },
  "steps": [
    {
      "type": "skill",
      "name": "analyze",
      "skill": "code-analysis",
      "prompt": "Analyze {{targetFile}} for issues",
    },
    {
      "type": "conditional",
      "name": "check-results",
      "condition": "lastResult.success",
      "then": [
        {
          "type": "skill",
          "name": "fix",
          "skill": "code-fix",
          "prompt": "Fix issues found in {{targetFile}}",
        },
      ],
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

Executes a single skill with a prompt. Supports `{{variable}}` interpolation.

```jsonc
{
  "type": "skill",
  "name": "analyze-code",
  "skill": "code-analysis",
  "prompt": "Analyze {{targetFile}}",
}
```

#### Conditional Step

Branches execution based on a condition.

```jsonc
{
  "type": "conditional",
  "name": "check-result",
  "condition": "hasIssues",
  "then": [
    // steps when condition is true
  ],
  "else": [
    // steps when condition is false (optional)
  ],
}
```

Supported conditions:

- Variable truthiness: `"variableName"`
- Equality: `"variable == \"value\""`
- Inequality: `"variable != \"value\""`
- Last result: `"lastResult.success"`
- Output contains: `"lastResult.output contains \"error\""`

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

- `simple-sequential.jsonc` -- Basic skill chain
- `conditional-fix.jsonc` -- Conditional branching
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
