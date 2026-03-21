import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { setupTestDirectory } from "../test-utils/test-directories.js";
import { parseFlowContent, parseFlowFile } from "./flow-parser.js";

describe("parseFlowContent", () => {
  it("parses a valid flow definition", () => {
    const content = JSON.stringify({
      name: "test-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "skill",
          name: "step-1",
          skill: "test-skill",
          prompt: "test prompt",
        },
      ],
    });

    const result = parseFlowContent({ content });
    expect(result.name).toBe("test-flow");
    expect(result.defaultTool).toBe("opencode");
    expect(result.defaultModel).toBe("github-copilot/claude-opus-4.6");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.type).toBe("skill");
  });

  it("parses JSONC with comments", () => {
    const content = `{
      // This is a comment
      "name": "commented-flow",
      "defaultTool": "opencode",
      "defaultModel": "github-copilot/claude-opus-4.6",
      "steps": [
        {
          "type": "skill",
          "name": "step-1",
          "skill": "my-skill",
          "prompt": "do something"
        }
      ]
    }`;

    const result = parseFlowContent({ content });
    expect(result.name).toBe("commented-flow");
  });

  it("parses JSONC with trailing commas", () => {
    const content = `{
      "name": "trailing-comma-flow",
      "defaultTool": "opencode",
      "defaultModel": "github-copilot/claude-opus-4.6",
      "steps": [
        {
          "type": "skill",
          "name": "step-1",
          "skill": "my-skill",
          "prompt": "do something",
        },
      ],
    }`;

    const result = parseFlowContent({ content });
    expect(result.name).toBe("trailing-comma-flow");
  });

  it("parses flow with optional fields", () => {
    const content = JSON.stringify({
      name: "full-flow",
      description: "A test flow",
      version: "1.0.0",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      variables: { key: "value" },
      steps: [
        {
          type: "skill",
          name: "step-1",
          skill: "test-skill",
          prompt: "test prompt",
          config: { timeout: 5000 },
        },
      ],
    });

    const result = parseFlowContent({ content });
    expect(result.description).toBe("A test flow");
    expect(result.version).toBe("1.0.0");
    expect(result.variables).toEqual({ key: "value" });
  });

  it("parses flow with skill step that has a next string", () => {
    const content = JSON.stringify({
      name: "next-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "skill",
          name: "step-a",
          skill: "s1",
          prompt: "p1",
          next: "step-c",
        },
        {
          type: "skill",
          name: "step-b",
          skill: "s2",
          prompt: "p2",
        },
        {
          type: "skill",
          name: "step-c",
          skill: "s3",
          prompt: "p3",
        },
      ],
    });

    const result = parseFlowContent({ content });
    expect(result.steps).toHaveLength(3);
    const firstStep = result.steps[0];
    expect(firstStep?.type).toBe("skill");
    if (firstStep?.type === "skill") {
      expect(firstStep.next).toBe("step-c");
    }
  });

  it("parses flow with skill step that has next rules array", () => {
    const content = JSON.stringify({
      name: "rules-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "skill",
          name: "check",
          skill: "checker",
          prompt: "check something",
          next: [{ condition: "hasIssues", step: "fix" }, { step: "done" }],
        },
        {
          type: "skill",
          name: "fix",
          skill: "fixer",
          prompt: "fix it",
        },
        {
          type: "skill",
          name: "done",
          skill: "reporter",
          prompt: "report done",
        },
      ],
    });

    const result = parseFlowContent({ content });
    const firstStep = result.steps[0];
    expect(firstStep?.type).toBe("skill");
    if (firstStep?.type === "skill") {
      expect(Array.isArray(firstStep.next)).toBe(true);
    }
  });

  it("parses flow with while-loop step", () => {
    const content = JSON.stringify({
      name: "loop-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "while-loop",
          name: "retry",
          condition: "shouldRetry",
          maxIterations: 5,
          steps: [
            {
              type: "skill",
              name: "retry-step",
              skill: "runner",
              prompt: "retry",
            },
          ],
        },
      ],
    });

    const result = parseFlowContent({ content });
    expect(result.steps[0]?.type).toBe("while-loop");
  });

  it("parses flow with for-each step", () => {
    const content = JSON.stringify({
      name: "foreach-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "for-each",
          name: "process-items",
          items: "fileList",
          as: "file",
          steps: [
            {
              type: "skill",
              name: "process",
              skill: "processor",
              prompt: "process {{file}}",
            },
          ],
        },
      ],
    });

    const result = parseFlowContent({ content });
    expect(result.steps[0]?.type).toBe("for-each");
  });

  it("throws on empty content", () => {
    expect(() => parseFlowContent({ content: "" })).toThrow();
  });

  it("throws on missing required fields", () => {
    const content = JSON.stringify({ description: "no name" });
    expect(() => parseFlowContent({ content })).toThrow("Flow validation errors");
  });

  it("throws on empty steps array", () => {
    const content = JSON.stringify({
      name: "empty-steps",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [],
    });
    expect(() => parseFlowContent({ content })).toThrow("Flow validation errors");
  });

  it("throws on invalid step type", () => {
    const content = JSON.stringify({
      name: "bad-step",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [{ type: "unknown", name: "x" }],
    });
    expect(() => parseFlowContent({ content })).toThrow("Flow validation errors");
  });

  it("rejects the removed conditional step type", () => {
    const content = JSON.stringify({
      name: "old-cond",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "conditional",
          name: "check",
          condition: "someVar",
          // oxlint-disable-next-line unicorn/no-thenable -- testing old conditional step rejection
          then: [{ type: "skill", name: "s", skill: "s", prompt: "p" }],
        },
      ],
    });
    expect(() => parseFlowContent({ content })).toThrow("Flow validation errors");
  });

  it("parses flow with per-step tool and model overrides", () => {
    const content = JSON.stringify({
      name: "override-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "skill",
          name: "step-1",
          skill: "test-skill",
          prompt: "test prompt",
          tool: "claude-agent",
          model: "claude-sonnet-4-20250514",
        },
      ],
    });

    const result = parseFlowContent({ content });
    const step = result.steps[0];
    expect(step?.type).toBe("skill");
    if (step?.type === "skill") {
      expect(step.tool).toBe("claude-agent");
      expect(step.model).toBe("claude-sonnet-4-20250514");
    }
  });

  it("throws on missing defaultTool and defaultModel", () => {
    const content = JSON.stringify({
      name: "missing-defaults",
      steps: [
        {
          type: "skill",
          name: "step-1",
          skill: "test-skill",
          prompt: "test prompt",
        },
      ],
    });
    expect(() => parseFlowContent({ content })).toThrow("Flow validation errors");
  });
});

describe("parseFlowFile", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
  });

  afterEach(async () => {
    await cleanup();
  });

  it("reads and parses a flow file from disk", async () => {
    const flowContent = JSON.stringify({
      name: "file-flow",
      defaultTool: "opencode",
      defaultModel: "github-copilot/claude-opus-4.6",
      steps: [
        {
          type: "skill",
          name: "step-1",
          skill: "test-skill",
          prompt: "test prompt",
        },
      ],
    });

    const filePath = join(testDir, "test.jsonc");
    await writeFile(filePath, flowContent, "utf-8");

    const result = await parseFlowFile({ filePath });
    expect(result.name).toBe("file-flow");
    expect(result.steps).toHaveLength(1);
  });

  it("throws on non-existent file", async () => {
    const filePath = join(testDir, "non-existent.jsonc");
    await expect(parseFlowFile({ filePath })).rejects.toThrow();
  });
});
