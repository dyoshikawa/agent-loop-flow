# Flow Definition

Flows are defined in JSONC files. Each flow has a name, a default tool and model, optional variables, and a flat list of steps with optional transition rules.

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

Executes a single skill with a prompt. Supports `{{variable}}` interpolation and optional `next` transition rules.

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
  // Optional transition:
  "next": "verify-step",
}
```

| Field    | Type                   | Required | Description                                        |
| -------- | ---------------------- | -------- | -------------------------------------------------- |
| `type`   | `"skill"`              | Yes      | Step type                                          |
| `name`   | `string`               | Yes      | Step name (used as jump target)                    |
| `skill`  | `string`               | Yes      | Skill identifier                                   |
| `prompt` | `string`               | Yes      | Prompt template (supports `{{var}}` interpolation) |
| `tool`   | `string`               | No       | Override `defaultTool` for this step               |
| `model`  | `string`               | No       | Override `defaultModel` for this step              |
| `config` | `object`               | No       | Additional configuration                           |
| `next`   | `string \| NextRule[]` | No       | Transition to another step (see below)             |

### Transition Rules (`next`)

The `next` field on a skill step controls which step executes after it. If omitted, the engine falls through to the next step in array order.

#### Unconditional jump

Set `next` to a step name string to always jump there:

```jsonc
{
  "type": "skill",
  "name": "step-a",
  "skill": "s",
  "prompt": "do A",
  "next": "step-c", // always skip to step-c
}
```

#### Conditional rules

Set `next` to an array of rule objects. Each rule has an optional `condition` and a `step` target. Rules are evaluated top-to-bottom; the first matching condition wins. A rule without a `condition` acts as the default (else) branch.

```jsonc
{
  "type": "skill",
  "name": "analyze",
  "skill": "analyzer",
  "prompt": "Analyze code",
  "next": [
    { "condition": "hasIssues", "step": "fix-issues" },
    { "step": "report-clean" }, // default branch
  ],
}
```

| Field       | Type     | Required | Description                      |
| ----------- | -------- | -------- | -------------------------------- |
| `condition` | `string` | No       | Condition expression (see below) |
| `step`      | `string` | Yes      | Target step name                 |

If no rule matches and there is no default rule, the engine falls through to the next step in array order.

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

Use `{{variableName}}` in prompts to interpolate values. Dot-path access is also supported (e.g. `{{obj.key}}`).

### Previous Result Variables

Each skill step automatically has access to the previous step's result via template variables. This allows chaining step outputs into subsequent prompts.

#### Dot-path access

| Variable                      | Type      | Description                        |
| ----------------------------- | --------- | ---------------------------------- |
| `{{previousResult.output}}`   | `string`  | The output text from the last step |
| `{{previousResult.success}}`  | `boolean` | Whether the last step succeeded    |
| `{{previousResult.stepName}}` | `string`  | Name of the last step              |
| `{{previousResult.skill}}`    | `string`  | Skill identifier of the last step  |
| `{{previousResult.error}}`    | `string`  | Error message (if the step failed) |

#### Flat camelCase variables

| Variable                     | Type      | Description                           |
| ---------------------------- | --------- | ------------------------------------- |
| `{{previousResultOutput}}`   | `string`  | Same as `{{previousResult.output}}`   |
| `{{previousResultSuccess}}`  | `boolean` | Same as `{{previousResult.success}}`  |
| `{{previousResultStepName}}` | `string`  | Same as `{{previousResult.stepName}}` |
| `{{previousResultSkill}}`    | `string`  | Same as `{{previousResult.skill}}`    |
| `{{previousResultError}}`    | `string`  | Same as `{{previousResult.error}}`    |

If there is no previous step (e.g. the first step in a flow), the placeholders are left as-is.

**Example:**

```jsonc
{
  "steps": [
    {
      "type": "skill",
      "name": "analyze",
      "skill": "code-analysis",
      "prompt": "Analyze {{targetFile}} for issues",
    },
    {
      "type": "skill",
      "name": "fix",
      "skill": "code-fix",
      "prompt": "Fix the issues found in the analysis:\n{{previousResult.output}}",
    },
  ],
}
```

## Branching Example

Use `next` rules on skill steps for if/else style branching without nesting:

```jsonc
{
  "steps": [
    {
      "type": "skill",
      "name": "analyze",
      "skill": "code-analysis",
      "prompt": "Analyze {{targetFile}}",
      "next": [{ "condition": "hasIssues", "step": "fix-issues" }, { "step": "report-clean" }],
    },
    {
      "type": "skill",
      "name": "fix-issues",
      "skill": "code-fix",
      "prompt": "Fix issues:\n{{previousResult.output}}",
      "next": "verify-fix",
    },
    {
      "type": "skill",
      "name": "verify-fix",
      "skill": "test-runner",
      "prompt": "Run tests",
    },
    {
      "type": "skill",
      "name": "report-clean",
      "skill": "reporter",
      "prompt": "All clean",
    },
  ],
}
```

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
- `conditional-fix.jsonc` -- Conditional branching via next rules
- `loop-processing.jsonc` -- For-each and while loops
