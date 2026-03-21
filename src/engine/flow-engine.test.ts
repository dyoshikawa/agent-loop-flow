import { describe, it, expect, vi } from "vitest";

import type { FlowDefinition, SkillExecutor } from "../index.js";
import {
  createFlowEngine,
  defaultConditionEvaluator,
  defaultItemsResolver,
  interpolateTemplate,
} from "./flow-engine.js";

const createMockSkillExecutor = (
  responses?: Record<string, { output: string; success: boolean }>,
): SkillExecutor => {
  return vi.fn(
    async ({
      skill,
      prompt,
      _tool,
      _model,
    }: {
      skill: string;
      prompt: string;
      _tool?: string;
      _model?: string;
    }) => {
      if (responses?.[skill]) {
        return responses[skill];
      }
      return {
        output: `Executed ${skill}: ${prompt}`,
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
        lastResult: { stepName: "s", skill: "sk", output: "", success: true },
      }),
    ).toBe(true);
    expect(
      defaultConditionEvaluator({
        condition: "lastResult.success",
        variables: {},
        lastResult: { stepName: "s", skill: "sk", output: "", success: false },
      }),
    ).toBe(false);
  });

  it('evaluates lastResult.output contains "X"', () => {
    expect(
      defaultConditionEvaluator({
        condition: 'lastResult.output contains "error"',
        variables: {},
        lastResult: { stepName: "s", skill: "sk", output: "found an error here", success: false },
      }),
    ).toBe(true);
    expect(
      defaultConditionEvaluator({
        condition: 'lastResult.output contains "error"',
        variables: {},
        lastResult: { stepName: "s", skill: "sk", output: "all good", success: true },
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
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-1", skill: "skill-a", prompt: "prompt-a" },
          { type: "skill", name: "step-2", skill: "skill-b", prompt: "prompt-b" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepName).toBe("step-1");
      expect(result.results[1]?.stepName).toBe("step-2");
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it("interpolates variables in prompts", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { target: "index.ts" },
        steps: [{ type: "skill", name: "step-1", skill: "analyzer", prompt: "Analyze {{target}}" }],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Analyze index.ts" }),
      );
    });

    it("merges initial variables with flow variables", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { a: "from-flow", b: "from-flow" },
        steps: [{ type: "skill", name: "step-1", skill: "s", prompt: "{{a}} {{b}}" }],
      };

      await engine.executeFlow({ flow, initialVariables: { b: "from-cli" } });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "from-flow from-cli" }),
      );
    });

    it("reports failure when a skill fails", async () => {
      const executor = createMockSkillExecutor({
        "failing-skill": { output: "error", success: false },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [{ type: "skill", name: "step-1", skill: "failing-skill", prompt: "p" }],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(false);
      expect(result.results[0]?.success).toBe(false);
    });

    it("handles executor exceptions", async () => {
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- test-local executor
      const executor: SkillExecutor = async () => {
        throw new Error("executor crashed");
      };
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "test-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [{ type: "skill", name: "step-1", skill: "s", prompt: "p" }],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(false);
      expect(result.results[0]?.error).toContain("executor crashed");
    });
  });

  describe("previousResult template variables", () => {
    it("injects previousResult.output into the next step prompt via dot-path", async () => {
      const executor = createMockSkillExecutor({
        "step-a-skill": { output: "analysis result from step A", success: true },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "prev-result-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-a", skill: "step-a-skill", prompt: "analyze code" },
          {
            type: "skill",
            name: "step-b",
            skill: "step-b-skill",
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
      const executor = createMockSkillExecutor({
        analyze: { output: "found 3 bugs", success: true },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "flat-var-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-1", skill: "analyze", prompt: "analyze code" },
          {
            type: "skill",
            name: "step-2",
            skill: "fix",
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
      const executor = createMockSkillExecutor({
        analyze: { output: "done", success: true },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "success-var-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-1", skill: "analyze", prompt: "analyze" },
          {
            type: "skill",
            name: "step-2",
            skill: "report",
            prompt: "Previous succeeded: {{previousResult.success}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Previous succeeded: true" }),
      );
    });

    it("injects previousResultStepName and previousResultSkill", async () => {
      const executor = createMockSkillExecutor({
        analyzer: { output: "ok", success: true },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "metadata-var-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "analyze-step", skill: "analyzer", prompt: "analyze" },
          {
            type: "skill",
            name: "step-2",
            skill: "reporter",
            prompt: "Step: {{previousResult.stepName}}, Skill: {{previousResult.skill}}",
          },
        ],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "Step: analyze-step, Skill: analyzer" }),
      );
    });

    it("keeps previousResult placeholders when there is no previous step", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "no-prev-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "skill",
            name: "step-1",
            skill: "s",
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
      const executor = createMockSkillExecutor({
        analyze: { output: "issues found", success: true },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "next-prev-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { enabled: true },
        steps: [
          {
            type: "skill",
            name: "step-1",
            skill: "analyze",
            prompt: "analyze",
            next: [{ condition: "enabled", step: "fix" }],
          },
          {
            type: "skill",
            name: "skipped",
            skill: "noop",
            prompt: "should not run",
          },
          {
            type: "skill",
            name: "fix",
            skill: "fixer",
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
      const executor: SkillExecutor = vi.fn(async ({ prompt: _prompt }) => {
        callIndex++;
        return { output: `result-${String(callIndex)}`, success: true };
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "foreach-prev-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { files: ["a.ts", "b.ts"] },
        steps: [
          { type: "skill", name: "init", skill: "init", prompt: "initialize" },
          {
            type: "for-each",
            name: "process",
            items: "files",
            as: "file",
            steps: [
              {
                type: "skill",
                name: "process-file",
                skill: "processor",
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
      const executor = createMockSkillExecutor({
        analyze: { output: "analysis", success: true },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const variables = { target: "file.ts" };
      const flow: FlowDefinition = {
        name: "no-mutate-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables,
        steps: [
          { type: "skill", name: "step-1", skill: "analyze", prompt: "analyze {{target}}" },
          {
            type: "skill",
            name: "step-2",
            skill: "fix",
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
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "jump-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-a", skill: "sa", prompt: "a", next: "step-c" },
          { type: "skill", name: "step-b", skill: "sb", prompt: "b" },
          { type: "skill", name: "step-c", skill: "sc", prompt: "c" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      // step-b should be skipped
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepName).toBe("step-a");
      expect(result.results[1]?.stepName).toBe("step-c");
    });

    it("evaluates condition rules and jumps to matching step", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "cond-jump-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { hasIssues: true },
        steps: [
          {
            type: "skill",
            name: "analyze",
            skill: "analyzer",
            prompt: "analyze",
            next: [{ condition: "hasIssues", step: "fix" }, { step: "done" }],
          },
          { type: "skill", name: "fix", skill: "fixer", prompt: "fix" },
          { type: "skill", name: "done", skill: "reporter", prompt: "done" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(3);
      expect(result.results[0]?.stepName).toBe("analyze");
      expect(result.results[1]?.stepName).toBe("fix");
      expect(result.results[2]?.stepName).toBe("done");
    });

    it("jumps to default rule when no condition matches", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "default-rule-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { hasIssues: false },
        steps: [
          {
            type: "skill",
            name: "analyze",
            skill: "analyzer",
            prompt: "analyze",
            next: [{ condition: "hasIssues", step: "fix" }, { step: "done" }],
          },
          { type: "skill", name: "fix", skill: "fixer", prompt: "fix" },
          { type: "skill", name: "done", skill: "reporter", prompt: "done" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      // Should skip fix and jump to done
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepName).toBe("analyze");
      expect(result.results[1]?.stepName).toBe("done");
    });

    it("falls through when no next rules match and no default", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "fallthrough-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: {},
        steps: [
          {
            type: "skill",
            name: "step-a",
            skill: "sa",
            prompt: "a",
            next: [{ condition: "nonExistent", step: "step-c" }],
          },
          { type: "skill", name: "step-b", skill: "sb", prompt: "b" },
          { type: "skill", name: "step-c", skill: "sc", prompt: "c" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      // No rule matched, so falls through to step-b, then step-c
      expect(result.results).toHaveLength(3);
      expect(result.results[0]?.stepName).toBe("step-a");
      expect(result.results[1]?.stepName).toBe("step-b");
      expect(result.results[2]?.stepName).toBe("step-c");
    });

    it("falls through when next has no value", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "no-next-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-a", skill: "sa", prompt: "a" },
          { type: "skill", name: "step-b", skill: "sb", prompt: "b" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepName).toBe("step-a");
      expect(result.results[1]?.stepName).toBe("step-b");
    });

    it("uses lastResult in next-rule condition evaluation", async () => {
      const executor = createMockSkillExecutor({
        checker: { output: "found an error in code", success: false },
      });
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "last-result-next-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "skill",
            name: "check",
            skill: "checker",
            prompt: "check",
            next: [{ condition: "lastResult.success", step: "done" }, { step: "fix" }],
          },
          { type: "skill", name: "fix", skill: "fixer", prompt: "fix" },
          { type: "skill", name: "done", skill: "reporter", prompt: "done" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      // lastResult.success is false, so should go to fix, not done
      expect(result.results).toHaveLength(3);
      expect(result.results[0]?.stepName).toBe("check");
      expect(result.results[1]?.stepName).toBe("fix");
      expect(result.results[2]?.stepName).toBe("done");
    });

    it("warns and falls through on unknown next target", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "unknown-target-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          { type: "skill", name: "step-a", skill: "sa", prompt: "a", next: "nonexistent" },
          { type: "skill", name: "step-b", skill: "sb", prompt: "b" },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(2);
      expect(result.results[0]?.stepName).toBe("step-a");
      expect(result.results[1]?.stepName).toBe("step-b");
    });
  });

  describe("while-loop execution", () => {
    it("loops while condition is true", async () => {
      let callCount = 0;
      const executor: SkillExecutor = async ({ prompt: _prompt }) => {
        callCount++;
        return { output: `call ${String(callCount)}`, success: true };
      };
      const condEval = vi.fn();
      condEval.mockReturnValueOnce(true);
      condEval.mockReturnValueOnce(true);
      condEval.mockReturnValueOnce(false);

      const engine = createFlowEngine({
        skillExecutor: executor,
        conditionEvaluator: condEval,
      });

      const flow: FlowDefinition = {
        name: "loop-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "while-loop",
            name: "retry",
            condition: "shouldRetry",
            maxIterations: 10,
            steps: [{ type: "skill", name: "action", skill: "s", prompt: "p" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
    });

    it("respects maxIterations limit", async () => {
      const executor = createMockSkillExecutor();
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- test-local evaluator
      const alwaysTrue = () => true;

      const engine = createFlowEngine({
        skillExecutor: executor,
        conditionEvaluator: alwaysTrue,
      });

      const flow: FlowDefinition = {
        name: "loop-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [
          {
            type: "while-loop",
            name: "infinite",
            condition: "always",
            maxIterations: 3,
            steps: [{ type: "skill", name: "action", skill: "s", prompt: "p" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.results).toHaveLength(3);
    });
  });

  describe("for-each execution", () => {
    it("iterates over array items", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "foreach-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { files: ["a.ts", "b.ts", "c.ts"] },
        steps: [
          {
            type: "for-each",
            name: "process",
            items: "files",
            as: "file",
            steps: [{ type: "skill", name: "lint", skill: "linter", prompt: "lint {{file}}" }],
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
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "foreach-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: {},
        steps: [
          {
            type: "for-each",
            name: "process",
            items: "missing",
            as: "item",
            steps: [{ type: "skill", name: "action", skill: "s", prompt: "p" }],
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
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "tool-test",
        defaultTool: "opencode",
        defaultModel: "test-model",
        steps: [{ type: "skill", name: "step-1", skill: "s", prompt: "p" }],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ tool: "opencode", model: "test-model" }),
      );
    });

    it("passes step-level tool/model overrides to executor", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "override-test",
        defaultTool: "opencode",
        defaultModel: "default-model",
        steps: [
          {
            type: "skill",
            name: "step-1",
            skill: "s",
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
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "fallback-test",
        defaultTool: "claude-agent",
        defaultModel: "default-model",
        steps: [{ type: "skill", name: "step-1", skill: "s", prompt: "p" }],
      };

      await engine.executeFlow({ flow });
      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ tool: "claude-agent", model: "default-model" }),
      );
    });
  });
});
