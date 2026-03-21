# CLI Reference

## Usage

```bash
agent-loop-flow <command> [options]
```

During development:

```bash
pnpm dev <command> [options]
```

## Commands

### `run`

Run a flow definition file.

```bash
agent-loop-flow run <file> [options]
```

**Arguments:**

| Argument | Description                                 |
| -------- | ------------------------------------------- |
| `<file>` | Path to the flow definition file (`.jsonc`) |

**Options:**

| Option                | Description                                   |
| --------------------- | --------------------------------------------- |
| `-v, --var <vars...>` | Set variables as `key=value` pairs            |
| `--dry-run`           | Parse and validate the flow without executing |

**Examples:**

```bash
# Run a flow
agent-loop-flow run my-flow.jsonc

# Run with variables
agent-loop-flow run my-flow.jsonc --var targetFile=src/app.ts --var mode=strict

# Validate without executing
agent-loop-flow run my-flow.jsonc --dry-run
```

### `validate`

Validate a flow definition file without executing it.

```bash
agent-loop-flow validate <file>
```

**Arguments:**

| Argument | Description                                 |
| -------- | ------------------------------------------- |
| `<file>` | Path to the flow definition file (`.jsonc`) |

**Examples:**

```bash
agent-loop-flow validate my-flow.jsonc
```

## Global Options

| Option          | Description            |
| --------------- | ---------------------- |
| `-V, --version` | Display version number |
| `-h, --help`    | Display help           |
