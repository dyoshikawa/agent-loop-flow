# Flow Definition

Flows are defined in JSONC files. Each flow has a name, a default tool and model, optional variables, and a list of steps.

## Top-Level Fields

| Field          | Type                           | Required | Description                                       |
| -------------- | ------------------------------ | -------- | ------------------------------------------------- |
| `$schema`      | `string`                       | No       | Path to `flow-schema.json` for IDE autocompletion |
| `name`         | `string`                       | Yes      | Flow name                                         |
| `description`  | `string`                       | No       | Human-readable description                        |
| `version`      | `string`                       | No       | Flow version                                      |
| `defaultTool`  | `"opencode" \| "claude-agent"` | Yes      | Default execution backend                         |
| `defaultModel` | `string`                       | Yes      | Default model identifier                          |
| `variables`    | `Record<string, unknown>`      | No       | Initial variables                                 |
| `steps`        | `Step[]`                       | Yes      | List of steps to execute (min 1)                  |

## Step Types

### Skill Step

Executes a single skill with a prompt. Supports `{{variable}}` interpolation.

```jsonc
{
  "type": "skill",
  "name": "analyze-code",
  "skill": "code-analysis",
  "prompt": "Analyze {{targetFile}}",
  // Optional overrides:
  "tool": "claude-agent",
  "model": "claude-sonnet-4-20250514",
  "config": { "timeout": 30 },
}
```

| Field    | Type      | Required | Description                                        |
| -------- | --------- | -------- | -------------------------------------------------- |
| `type`   | `"skill"` | Yes      | Step type                                          |
| `name`   | `string`  | Yes      | Step name                                          |
| `skill`  | `string`  | Yes      | Skill identifier                                   |
| `prompt` | `string`  | Yes      | Prompt template (supports `{{var}}` interpolation) |
| `tool`   | `string`  | No       | Override `defaultTool` for this step               |
| `model`  | `string`  | No       | Override `defaultModel` for this step              |
| `config` | `object`  | No       | Additional configuration                           |

### Conditional Step

Branches execution based on a condition.

```jsonc
{
  "type": "conditional",
  "name": "check-result",
  "condition": "lastResult.success",
  "then": [
    // steps when condition is true
  ],
  "else": [
    // steps when condition is false (optional)
  ],
}
```

| Field       | Type            | Required | Description                 |
| ----------- | --------------- | -------- | --------------------------- |
| `type`      | `"conditional"` | Yes      | Step type                   |
| `name`      | `string`        | Yes      | Step name                   |
| `condition` | `string`        | Yes      | Condition expression        |
| `then`      | `Step[]`        | Yes      | Steps to execute when true  |
| `else`      | `Step[]`        | No       | Steps to execute when false |

#### Supported Conditions

- **Variable truthiness:** `"variableName"` -- checks if the variable is truthy
- **Equality:** `"variable == \"value\""` -- checks string equality
- **Inequality:** `"variable != \"value\""` -- checks string inequality
- **Last result success:** `"lastResult.success"` -- checks if the previous step succeeded
- **Output contains:** `"lastResult.output contains \"error\""` -- checks if output contains a substring

### While Loop

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

| Field           | Type           | Required | Description                 |
| --------------- | -------------- | -------- | --------------------------- |
| `type`          | `"while-loop"` | Yes      | Step type                   |
| `name`          | `string`       | Yes      | Step name                   |
| `condition`     | `string`       | Yes      | Condition expression        |
| `maxIterations` | `number`       | No       | Safety limit (default: 100) |
| `steps`         | `Step[]`       | Yes      | Steps to repeat             |

### For-Each Loop

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

| Field   | Type         | Required | Description                              |
| ------- | ------------ | -------- | ---------------------------------------- |
| `type`  | `"for-each"` | Yes      | Step type                                |
| `name`  | `string`     | Yes      | Step name                                |
| `items` | `string`     | Yes      | Variable name containing the items array |
| `as`    | `string`     | Yes      | Variable name for the current item       |
| `steps` | `Step[]`     | Yes      | Steps to execute per item                |

The loop also sets `{{as_index}}` (e.g., `{{currentFile_index}}`) to the zero-based index.

## Variables

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
pnpm dev run flow.jsonc --var targetFile=src/app.ts --var mode=lenient
```

Use `{{variableName}}` in prompts to interpolate values.

## JSON Schema

Point `$schema` to `flow-schema.json` for IDE autocompletion and validation:

```jsonc
{
  "$schema": "./flow-schema.json",
}
```

## Examples

See the `examples/` directory for sample flows:

- `helloworld.jsonc` -- Minimal single-step flow
- `simple-sequential.jsonc` -- Sequential skill chain
- `conditional-fix.jsonc` -- Conditional branching
- `loop-processing.jsonc` -- For-each and while loops
