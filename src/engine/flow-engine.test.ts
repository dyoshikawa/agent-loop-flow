import { describe, it, expect, vi } from "vitest";

import type { FlowDefinition, PromptExecutor } from "../index.js";
import {
  createFlowEngine,
  defaultConditionEvaluator,
  defaultItemsResolver,
  interpolateTemplate,
} from "./flow-engine.js";

const createMockPromptExecutor = (
  responses?: Record<string, { output: string; success: boolean }>,
): PromptExecutor => {
  return vi.fn(
    async ({
      name,
      prompt,
      _tool,
      _model,
    }: {
      name: string;
      prompt: string;
      _tool?: string;
      _model?: string;
    }) => {
      if (responses?.[name]) {
        return responses[name];
      }
      return {
        output: `Executed ${name}: ${prompt}`,
        success: true,
      };
    },
  );
};

describe("interpolateTemplate", () => {
  it("replaces variables in template", () => {
    const result = interpolateTemplate({
      template: "Hello {{name}}, welcome to {{place}}",
      variables: { name: "World", place: "Earth" },
    });
    expect(result).toBe("Hello World, welcome to Earth");
  });

  it("keeps unresolved placeholders", () => {
    const result = interpolateTemplate({
      template: "Hello {{name}}, {{unknown}} here",
      variables: { name: "World" },
    });
    expect(result).toBe("Hello World, {{unknown}} here");
  });

  it("handles empty variables", () => {
    const result = interpolateTemplate({
      template: "No {{vars}} here",
      variables: {},
    });
    expect(result).toBe("No {{vars}} here");
  });

  it("converts non-string values to strings", () => {
    const result = interpolateTemplate({
      template: "Count: {{count}}, Active: {{active}}",
      variables: { count: 42, active: true },
    });
    expect(result).toBe("Count: 42, Active: true");
  });

  it("resolves dot-path variables", () => {
    const result = interpolateTemplate({
      template: "Output: {{result.output}}, Success: {{result.success}}",
      variables: {
        result: { output: "hello world", success: true },
      },
    });
    expect(result).toBe("Output: hello world, Success: true");
  });

  it("keeps placeholder for unresolved dot-path", () => {
    const result = interpolateTemplate({
      template: "Value: {{a.b.c}}",
      variables: { a: { b: {} } },
    });
    expect(result).toBe("Value: {{a.b.c}}");
  });

  it("keeps placeholder when dot-path resolves to an object", () => {
    const result = interpolateTemplate({
      template: "Value: {{nested}}",
      variables: { nested: { key: "val" } },
    });
    expect(result).toBe("Value: {{nested}}");
  });

  it("resolves deeply nested dot-path", () => {
    const result = interpolateTemplate({
      template: "Deep: {{a.b.c}}",
      variables: { a: { b: { c: "found" } } },
    });
    expect(result).toBe("Deep: found");
  });
});

describe("defaultConditionEvaluator", () => {
  it("evaluates simple variable truthiness", () => {
    expect(defaultConditionEvaluator({ condition: "enabled", variables: { enabled: true } })).toBe(
      true,
    );
    expect(defaultConditionEvaluator({ condition: "enabled", variables: { enabled: false } })).toBe(
      false,
    );
    expect(defaultConditionEvaluator({ condition: "enabled", variables: {} })).toBe(false);
  });

  it("evaluates lastResult.success", () => {
    expect(
      defaultConditionEvaluator({
        condition: "lastResult.success",
        variables: {},
        lastResult: { stepId: "s", name: "n", output: "", success: true },
      }),
    ).toBe(true);
    expect(
      defaultConditionEvaluator({
        condition: "lastResult.success",
        variables: {},
        lastResult: { stepId: "s", name: "n", output: "", success: false },
      }),
    ).toBe(false);
  });

  it('evaluates lastResult.output contains "X"', () => {
    expect(
      defaultConditionEvaluator({
        condition: 'lastResult.output contains "error"',
        variables: {},
        lastResult: { stepId: "s", name: "n", output: "found an error here", success: false },
      }),
    ).toBe(true);
    expect(
      defaultConditionEvaluator({
        condition: 'lastResult.output contains "error"',
        variables: {},
        lastResult: { stepId: "s", name: "n", output: "all good", success: true },
      }),
    ).toBe(false);
  });

  it('evaluates equality: variable == "value"', () => {
    expect(
      defaultConditionEvaluator({
        condition: 'status == "ready"',
        variables: { status: "ready" },
      }),
    ).toBe(true);
    expect(
      defaultConditionEvaluator({
        condition: 'status == "ready"',
        variables: { status: "pending" },
      }),
    ).toBe(false);
  });

  it('evaluates inequality: variable != "value"', () => {
    expect(
      defaultConditionEvaluator({
        condition: 'status != "done"',
        variables: { status: "running" },
      }),
    ).toBe(true);
    expect(
      defaultConditionEvaluator({
        condition: 'status != "done"',
        variables: { status: "done" },
      }),
    ).toBe(false);
  });
});

describe("defaultItemsResolver", () => {
  it("resolves array variables", () => {
    const items = defaultItemsResolver({
      items: "files",
      variables: { files: ["a.ts", "b.ts", "c.ts"] },
    });
    expect(items).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("splits comma-separated strings", () => {
    const items = defaultItemsResolver({
      items: "files",
      variables: { files: "a.ts, b.ts, c.ts" },
    });
    expect(items).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("returns empty array for missing variable", () => {
    const items = defaultItemsResolver({ items: "missing", variables: {} });
    expect(items).toEqual([]);
  });
});

describe("createFlowEngine", () => {
  describe("sequential execution", () => {
    it("executes steps in order", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-1", name: "prompt-a", prompt: "prompt-a" },
          { type: "prompt", id: "step-2", name: "prompt-b", prompt: "prompt-b" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepId).toBe("step-1");
      expect(result.results[1]?.stepId).toBe("step-2");
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it("interpolates variables in prompts", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { target: "index.ts" },
        steps: [{ type: "prompt", id: "step-1", name: "analyzer", prompt: "Analyze {{target}}" }],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Analyze index.ts" }),
      );
    });

    it("merges initial variables with flow variables", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { a: "from-flow", b: "from-flow" },
        steps: [{ type: "prompt", id: "step-1", name: "s", prompt: "{{a}} {{b}}" }],
      };

      await engine.executeFlow({ flow, initialVariables: { b: "from-cli" } });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "from-flow from-cli" }),
      );
    });

    it("reports failure when a prompt fails", async () => {
      const executor = createMockPromptExecutor({
        "failing-prompt": { output: "error", success: false },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [{ type: "prompt", id: "step-1", name: "failing-prompt", prompt: "p" }],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(false);
      expect(result.results[0]?.success).toBe(false);
    });

    it("handles executor exceptions", async () => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- test-local executor
      const executor: PromptExecutor = async () => {
        throw new Error("executor crashed");
      };
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [{ type: "prompt", id: "step-1", name: "s", prompt: "p" }],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(false);
      expect(result.results[0]?.error).toContain("executor crashed");
    });
  });

  describe("previousResult template variables", () => {
    it("injects previousResult.output into the next step prompt via dot-path", async () => {
      const executor = createMockPromptExecutor({
        "step-a-prompt": { output: "analysis result from step A", success: true },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "prev-result-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-a", name: "step-a-prompt", prompt: "analyze code" },
          {
            type: "prompt",
            id: "step-b",
            name: "step-b-prompt",
            prompt: "Fix issues based on: {{previousResult.output}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Fix issues based on: analysis result from step A",
        }),
      );
    });

    it("injects previousResultOutput flat camelCase variable", async () => {
      const executor = createMockPromptExecutor({
        analyze: { output: "found 3 bugs", success: true },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "flat-var-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-1", name: "analyze", prompt: "analyze code" },
          {
            type: "prompt",
            id: "step-2",
            name: "fix",
            prompt: "Fix: {{previousResultOutput}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Fix: found 3 bugs" }),
      );
    });

    it("injects previousResult.success as a template variable", async () => {
      const executor = createMockPromptExecutor({
        analyze: { output: "done", success: true },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "success-var-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-1", name: "analyze", prompt: "analyze" },
          {
            type: "prompt",
            id: "step-2",
            name: "report",
            prompt: "Previous succeeded: {{previousResult.success}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Previous succeeded: true" }),
      );
    });

    it("injects previousResultStepId and previousResultName", async () => {
      const executor = createMockPromptExecutor({
        analyzer: { output: "ok", success: true },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "metadata-var-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "analyze-step", name: "analyzer", prompt: "analyze" },
          {
            type: "prompt",
            id: "step-2",
            name: "reporter",
            prompt: "Step: {{previousResult.stepId}}, Name: {{previousResult.name}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Step: analyze-step, Name: analyzer" }),
      );
    });

    it("keeps previousResult placeholders when there is no previous step", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "no-prev-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "prompt",
            id: "step-1",
            name: "s",
            prompt: "No previous: {{previousResult.output}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "No previous: {{previousResult.output}}" }),
      );
    });

    it("threads previousResult through next-rule branches", async () => {
      const executor = createMockPromptExecutor({
        analyze: { output: "issues found", success: true },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "next-prev-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { enabled: true },
        steps: [
          {
            type: "prompt",
            id: "step-1",
            name: "analyze",
            prompt: "analyze",
            next: [{ condition: "enabled", step: "fix" }],
          },
          {
            type: "prompt",
            id: "skipped",
            name: "noop",
            prompt: "should not run",
          },
          {
            type: "prompt",
            id: "fix",
            name: "fixer",
            prompt: "Fix based on: {{previousResult.output}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Fix based on: issues found" }),
      );
    });

    it("threads previousResult through for-each loop iterations", async () => {
      let callIndex = 0;
      const executor: PromptExecutor = vi.fn(async ({ prompt: _prompt }) => {
        callIndex++;
        return { output: `result-${String(callIndex)}`, success: true };
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "foreach-prev-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { files: ["a.ts", "b.ts"] },
        steps: [
          { type: "prompt", id: "init", name: "init", prompt: "initialize" },
          {
            type: "for-each",
            id: "process",
            items: "files",
            as: "file",
            steps: [
              {
                type: "prompt",
                id: "process-file",
                name: "processor",
                prompt: "Process {{file}} with context: {{previousResult.output}}",
              },
            ],
          },
        ],
      };

      await engine.executeFlow({ flow });
      // First for-each iteration: previousResult is from "init" step (result-1)
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Process a.ts with context: result-1" }),
      );
      // Second for-each iteration: previousResult is from first iteration (result-2)
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Process b.ts with context: result-2" }),
      );
    });

    it("does not mutate the original variables object", async () => {
      const executor = createMockPromptExecutor({
        analyze: { output: "analysis", success: true },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const variables = { target: "file.ts" };
      const flow: FlowDefinition = {
        name: "no-mutate-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables,
        steps: [
          { type: "prompt", id: "step-1", name: "analyze", prompt: "analyze {{target}}" },
          {
            type: "prompt",
            id: "step-2",
            name: "fix",
            prompt: "fix {{previousResult.output}}",
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      // Original variables should not have previousResult injected
      expect(variables).toEqual({ target: "file.ts" });
    });
  });

  describe("next-rule transitions", () => {
    it("jumps to target step when next is a string", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "jump-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-a", name: "sa", prompt: "a", next: "step-c" },
          { type: "prompt", id: "step-b", name: "sb", prompt: "b" },
          { type: "prompt", id: "step-c", name: "sc", prompt: "c" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      // step-b should be skipped
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepId).toBe("step-a");
      expect(result.results[1]?.stepId).toBe("step-c");
    });

    it("evaluates condition rules and jumps to matching step", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "cond-jump-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { hasIssues: true },
        steps: [
          {
            type: "prompt",
            id: "analyze",
            name: "analyzer",
            prompt: "analyze",
            next: [{ condition: "hasIssues", step: "fix" }, { step: "done" }],
          },
          { type: "prompt", id: "fix", name: "fixer", prompt: "fix" },
          { type: "prompt", id: "done", name: "reporter", prompt: "done" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(3);
      expect(result.results[0]?.stepId).toBe("analyze");
      expect(result.results[1]?.stepId).toBe("fix");
      expect(result.results[2]?.stepId).toBe("done");
    });

    it("jumps to default rule when no condition matches", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "default-rule-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { hasIssues: false },
        steps: [
          {
            type: "prompt",
            id: "analyze",
            name: "analyzer",
            prompt: "analyze",
            next: [{ condition: "hasIssues", step: "fix" }, { step: "done" }],
          },
          { type: "prompt", id: "fix", name: "fixer", prompt: "fix" },
          { type: "prompt", id: "done", name: "reporter", prompt: "done" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      // Should skip fix and jump to done
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepId).toBe("analyze");
      expect(result.results[1]?.stepId).toBe("done");
    });

    it("falls through when no next rules match and no default", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "fallthrough-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: {},
        steps: [
          {
            type: "prompt",
            id: "step-a",
            name: "sa",
            prompt: "a",
            next: [{ condition: "nonExistent", step: "step-c" }],
          },
          { type: "prompt", id: "step-b", name: "sb", prompt: "b" },
          { type: "prompt", id: "step-c", name: "sc", prompt: "c" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      // No rule matched, so falls through to step-b, then step-c
      expect(result.results).toHaveLength(3);
      expect(result.results[0]?.stepId).toBe("step-a");
      expect(result.results[1]?.stepId).toBe("step-b");
      expect(result.results[2]?.stepId).toBe("step-c");
    });

    it("falls through when next has no value", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "no-next-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-a", name: "sa", prompt: "a" },
          { type: "prompt", id: "step-b", name: "sb", prompt: "b" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepId).toBe("step-a");
      expect(result.results[1]?.stepId).toBe("step-b");
    });

    it("uses lastResult in next-rule condition evaluation", async () => {
      const executor = createMockPromptExecutor({
        checker: { output: "found an error in code", success: false },
      });
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "last-result-next-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "prompt",
            id: "check",
            name: "checker",
            prompt: "check",
            next: [{ condition: "lastResult.success", step: "done" }, { step: "fix" }],
          },
          { type: "prompt", id: "fix", name: "fixer", prompt: "fix" },
          { type: "prompt", id: "done", name: "reporter", prompt: "done" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      // lastResult.success is false, so should go to fix, not done
      expect(result.results).toHaveLength(3);
      expect(result.results[0]?.stepId).toBe("check");
      expect(result.results[1]?.stepId).toBe("fix");
      expect(result.results[2]?.stepId).toBe("done");
    });

    it("warns and falls through on unknown next target", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "unknown-target-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "prompt", id: "step-a", name: "sa", prompt: "a", next: "nonexistent" },
          { type: "prompt", id: "step-b", name: "sb", prompt: "b" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepId).toBe("step-a");
      expect(result.results[1]?.stepId).toBe("step-b");
    });
  });

  describe("while-loop execution", () => {
    it("loops while condition is true", async () => {
      let callCount = 0;
      const executor: PromptExecutor = async ({ prompt: _prompt }) => {
        callCount++;
        return { output: `call ${String(callCount)}`, success: true };
      };
      const condEval = vi.fn();
      condEval.mockReturnValueOnce(true);
      condEval.mockReturnValueOnce(true);
      condEval.mockReturnValueOnce(false);

      const engine = createFlowEngine({
        promptExecutor: executor,
        conditionEvaluator: condEval,
      });

      const flow: FlowDefinition = {
        name: "loop-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "while-loop",
            id: "retry",
            condition: "shouldRetry",
            maxIterations: 10,
            steps: [{ type: "prompt", id: "action", name: "s", prompt: "p" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it("respects maxIterations limit", async () => {
      const executor = createMockPromptExecutor();
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- test-local evaluator
      const alwaysTrue = () => true;

      const engine = createFlowEngine({
        promptExecutor: executor,
        conditionEvaluator: alwaysTrue,
      });

      const flow: FlowDefinition = {
        name: "loop-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "while-loop",
            id: "infinite",
            condition: "always",
            maxIterations: 3,
            steps: [{ type: "prompt", id: "action", name: "s", prompt: "p" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(3);
    });
  });

  describe("for-each execution", () => {
    it("iterates over array items", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "foreach-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { files: ["a.ts", "b.ts", "c.ts"] },
        steps: [
          {
            type: "for-each",
            id: "process",
            items: "files",
            as: "file",
            steps: [{ type: "prompt", id: "lint", name: "linter", prompt: "lint {{file}}" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(3);
      expect(executor).toHaveBeenCalledWith(expect.objectContaining({ prompt: "lint a.ts" }));
      expect(executor).toHaveBeenCalledWith(expect.objectContaining({ prompt: "lint b.ts" }));
      expect(executor).toHaveBeenCalledWith(expect.objectContaining({ prompt: "lint c.ts" }));
    });

    it("handles empty items", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "foreach-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: {},
        steps: [
          {
            type: "for-each",
            id: "process",
            items: "missing",
            as: "item",
            steps: [{ type: "prompt", id: "action", name: "s", prompt: "p" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
    });
  });

  describe("tool and model passing", () => {
    it("passes default tool and model to executor", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "tool-test",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [{ type: "prompt", id: "step-1", name: "s", prompt: "p" }],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ tool: "opencode", model: "test-model" }),
      );
    });

    it("passes step-level tool/model overrides to executor", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "override-test",
        defaultTool: "opencode",
        defaultModel: "default-model",
        steps: [
          {
            type: "prompt",
            id: "step-1",
            name: "s",
            prompt: "p",
            tool: "claude-agent",
            model: "custom-model",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ tool: "claude-agent", model: "custom-model" }),
      );
    });

    it("falls back to defaults when step has no overrides", async () => {
      const executor = createMockPromptExecutor();
      const engine = createFlowEngine({ promptExecutor: executor });

      const flow: FlowDefinition = {
        name: "fallback-test",
        defaultTool: "claude-agent",
        defaultModel: "default-model",
        steps: [{ type: "prompt", id: "step-1", name: "s", prompt: "p" }],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ tool: "claude-agent", model: "default-model" }),
      );
    });
  });
});
