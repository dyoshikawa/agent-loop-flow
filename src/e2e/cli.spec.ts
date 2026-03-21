import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

/**
 * Resolves the CLI command and arguments to use.
 * If AGENT_LOOP_FLOW_CMD env var is set, uses it (for compiled binary testing in CI).
 * Otherwise, uses tsx to run the CLI source directly.
 */
const resolveCliCommand = (): { cmd: string; baseArgs: string[] } => {
  const envCmd = process.env["AGENT_LOOP_FLOW_CMD"];
  if (envCmd) {
    return { cmd: envCmd, baseArgs: [] };
  }
  return { cmd: "pnpm", baseArgs: ["tsx", "src/cli/index.ts"] };
};

const runCli = async (
  args: string[],
  options?: { cwd?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const { cmd, baseArgs } = resolveCliCommand();
  // Do NOT pass NODE_ENV=test to the child process, since the CLI logger
  // suppresses all output when NODE_ENV is "test".
  const childEnv = { ...process.env };
  delete childEnv["NODE_ENV"];
  try {
    const result = await execFileAsync(cmd, [...baseArgs, ...args], {
      cwd: options?.cwd ?? process.cwd(),
      timeout: 30_000,
      env: childEnv,
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: execError.stdout ?? "",
      stderr: execError.stderr ?? "",
      exitCode: execError.code ?? 1,
    };
  }
};

/**
 * Helper to write a flow file and return its path relative to cwd.
 * The CLI uses `join(process.cwd(), file)`, so we must pass relative paths.
 */
const writeFlowFile = async (
  relativeDir: string,
  filename: string,
  content: Record<string, unknown>,
): Promise<string> => {
  const absDir = join(process.cwd(), relativeDir);
  const absPath = join(absDir, filename);
  await writeFile(absPath, JSON.stringify(content));
  return join(relativeDir, filename);
};

describe("CLI E2E Tests", () => {
  describe("help command", () => {
    it("should display help text with --help flag", async () => {
      const { stdout, exitCode } = await runCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("agent-loop-flow");
      expect(stdout).toContain("run");
      expect(stdout).toContain("validate");
    });

    it("should display help for the run command", async () => {
      const { stdout, exitCode } = await runCli(["run", "--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Run a flow definition file");
      expect(stdout).toContain("--dry-run");
      expect(stdout).toContain("--var");
    });

    it("should display help for the validate command", async () => {
      const { stdout, exitCode } = await runCli(["validate", "--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Validate a flow definition file");
    });

    it("should display version with --version flag", async () => {
      const { stdout, exitCode } = await runCli(["--version"]);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("validate command", () => {
    it("should validate the simple-sequential example", async () => {
      const { stdout, exitCode } = await runCli(["validate", "examples/simple-sequential.jsonc"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("simple-sequential");
    });

    it("should validate the conditional-fix example", async () => {
      const { stdout, exitCode } = await runCli(["validate", "examples/conditional-fix.jsonc"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("conditional-fix");
    });

    it("should validate the loop-processing example", async () => {
      const { stdout, exitCode } = await runCli(["validate", "examples/loop-processing.jsonc"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("batch-process");
    });

    it("should fail for a non-existent file", async () => {
      const { exitCode, stderr } = await runCli(["validate", "non-existent-file.jsonc"]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid flow");
    });
  });

  describe("run command", () => {
    it("should run the simple-sequential flow", async () => {
      const { stdout, exitCode } = await runCli(["run", "examples/simple-sequential.jsonc"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("simple-sequential");
      expect(stdout).toContain("completed successfully");
    });

    it("should run a flow with --dry-run flag", async () => {
      const { stdout, exitCode } = await runCli([
        "run",
        "examples/simple-sequential.jsonc",
        "--dry-run",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Dry run mode");
      expect(stdout).toContain("simple-sequential");
    });

    it("should run the conditional-fix flow", async () => {
      const { stdout, exitCode } = await runCli(["run", "examples/conditional-fix.jsonc"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("conditional-fix");
      expect(stdout).toContain("completed successfully");
    });

    it("should run the loop-processing flow", async () => {
      const { stdout, exitCode } = await runCli(["run", "examples/loop-processing.jsonc"]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("batch-process");
      expect(stdout).toContain("completed successfully");
    });

    it("should pass variables via --var flag", async () => {
      const { stdout, exitCode } = await runCli([
        "run",
        "examples/simple-sequential.jsonc",
        "--var",
        "targetFile=src/custom.ts",
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("completed successfully");
    });

    it("should fail for a non-existent file", async () => {
      const { exitCode, stderr } = await runCli(["run", "non-existent-file.jsonc"]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Failed to run flow");
    });
  });

  describe("run command with custom flow files", () => {
    const tmpRelative = "tmp/e2e-tests";
    const tmpDir = join(process.cwd(), tmpRelative);

    beforeEach(async () => {
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("should run a minimal flow definition", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "minimal.jsonc", {
        name: "minimal-test",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        steps: [
          {
            type: "skill",
            name: "test-step",
            skill: "test-skill",
            prompt: "Do something",
          },
        ],
      });

      const { stdout, exitCode } = await runCli(["run", flowPath]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("minimal-test");
      expect(stdout).toContain("completed successfully");
    });

    it("should handle a flow with variables and interpolation", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "with-vars.jsonc", {
        name: "vars-test",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        variables: {
          greeting: "hello",
        },
        steps: [
          {
            type: "skill",
            name: "greet",
            skill: "greeter",
            prompt: "Say {{greeting}} to the world",
          },
        ],
      });

      const { stdout, exitCode } = await runCli(["run", flowPath]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("vars-test");
      expect(stdout).toContain("completed successfully");
    });

    it("should handle a flow with next-rule branching", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "next-rules.jsonc", {
        name: "next-rules-test",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        variables: {
          enabled: true,
        },
        steps: [
          {
            type: "skill",
            name: "check",
            skill: "checker",
            prompt: "Check state",
            next: [{ condition: "enabled", step: "run-if-enabled" }, { step: "skip-if-disabled" }],
          },
          {
            type: "skill",
            name: "run-if-enabled",
            skill: "worker",
            prompt: "Do work",
          },
          {
            type: "skill",
            name: "skip-if-disabled",
            skill: "reporter",
            prompt: "Report skipped",
          },
        ],
      });

      const { stdout, exitCode } = await runCli(["run", flowPath]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("next-rules-test");
      expect(stdout).toContain("completed successfully");
    });

    it("should handle a flow with for-each loop", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "for-each.jsonc", {
        name: "for-each-test",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        variables: {
          items: ["a", "b", "c"],
        },
        steps: [
          {
            type: "for-each",
            name: "process-items",
            items: "items",
            as: "item",
            steps: [
              {
                type: "skill",
                name: "process-item",
                skill: "processor",
                prompt: "Process {{item}}",
              },
            ],
          },
        ],
      });

      const { stdout, exitCode } = await runCli(["run", flowPath]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("for-each-test");
      expect(stdout).toContain("completed successfully");
    });

    it("should handle a flow with while-loop", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "while-loop.jsonc", {
        name: "while-loop-test",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        variables: {
          shouldLoop: false,
        },
        steps: [
          {
            type: "while-loop",
            name: "retry-loop",
            condition: "shouldLoop",
            maxIterations: 3,
            steps: [
              {
                type: "skill",
                name: "retry-step",
                skill: "retrier",
                prompt: "Retry the operation",
              },
            ],
          },
        ],
      });

      const { stdout, exitCode } = await runCli(["run", flowPath]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("while-loop-test");
      expect(stdout).toContain("completed successfully");
    });
  });

  describe("error handling", () => {
    const tmpRelative = "tmp/e2e-error-tests";
    const tmpDir = join(process.cwd(), tmpRelative);

    beforeEach(async () => {
      await mkdir(tmpDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tmpDir, { recursive: true, force: true });
    });

    it("should fail with invalid JSON content", async () => {
      const absPath = join(tmpDir, "invalid.jsonc");
      await writeFile(absPath, "{ this is not valid json at all }}}");
      const flowPath = join(tmpRelative, "invalid.jsonc");

      const { exitCode, stderr } = await runCli(["validate", flowPath]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid flow");
    });

    it("should fail when required fields are missing", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "missing-fields.jsonc", {
        name: "missing-steps",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        // steps field is missing
      });

      const { exitCode, stderr } = await runCli(["validate", flowPath]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid flow");
    });

    it("should fail when steps array is empty", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "empty-steps.jsonc", {
        name: "empty-steps",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        steps: [],
      });

      const { exitCode, stderr } = await runCli(["validate", flowPath]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid flow");
    });

    it("should fail when step has invalid type", async () => {
      const flowPath = await writeFlowFile(tmpRelative, "invalid-step-type.jsonc", {
        name: "invalid-type",
        version: "1.0.0",
        defaultTool: "opencode",
        defaultModel: "github-copilot/claude-opus-4.6",
        steps: [
          {
            type: "unknown-type",
            name: "bad-step",
          },
        ],
      });

      const { exitCode, stderr } = await runCli(["validate", flowPath]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("Invalid flow");
    });

    it("should display help when no command is provided", async () => {
      const { stderr } = await runCli([]);
      // Commander outputs help to stderr when no command is given
      expect(stderr).toContain("agent-loop-flow");
    });

    it("should fail for an unknown command", async () => {
      const { exitCode, stderr } = await runCli(["unknown-command"]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("unknown command");
    });
  });
});
