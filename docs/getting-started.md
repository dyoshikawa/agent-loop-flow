# Getting Started

## Installation

```bash
# Clone the repository
git clone https://github.com/dyoshikawa-claw/agent-loop-flow.git
cd agent-loop-flow

# Install dependencies
pnpm install

# Build
pnpm build
```

## Quick Start

### 1. Define a flow

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
  },
  "steps": [
    {
      "type": "prompt",
      "id": "analyze",
      "name": "code-analysis",
      "prompt": "Analyze {{targetFile}} for issues",
    },
  ],
}
```

### 2. Validate the flow

```bash
pnpm dev validate my-flow.jsonc
```

### 3. Run the flow

```bash
# Run the flow
pnpm dev run my-flow.jsonc

# Run with variable overrides
pnpm dev run my-flow.jsonc --var targetFile=src/app.ts

# Dry run (parse and validate only)
pnpm dev run my-flow.jsonc --dry-run
```

## Supported Tools

agent-loop-flow supports two execution backends:

- **`opencode`** -- Spawns `opencode run "<prompt>"` as a child process
- **`claude-agent`** -- Spawns `claude --print "<prompt>"` as a child process

Set the default tool in your flow definition with `defaultTool`, or override per-step with the `tool` field.

## Programmatic API

```typescript
import { parseFlowFile, createFlowEngine } from "agent-loop-flow";
import type { PromptExecutor } from "agent-loop-flow";

const promptExecutor: PromptExecutor = async ({ name, prompt, variables }) => {
  // Integrate with your preferred agent tool
  return { output: "result", success: true };
};

const flow = await parseFlowFile({ filePath: "my-flow.jsonc" });
const engine = createFlowEngine({ promptExecutor });
const result = await engine.executeFlow({ flow });

console.log(result.success);
console.log(result.results);
```
