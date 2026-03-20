// oxlint-disable unicorn/no-thenable -- "then" is a conditional branch property name, not a Promise thenable
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

  describe("conditional execution", () => {
    it("executes then branch when condition is true", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "cond-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { enabled: true },
        steps: [
          {
            type: "conditional",
            name: "check",
            condition: "enabled",
            then: [{ type: "skill", name: "then-step", skill: "s1", prompt: "then" }],
            else: [{ type: "skill", name: "else-step", skill: "s2", prompt: "else" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.stepName).toBe("then-step");
    });

    it("executes else branch when condition is false", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "cond-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: { enabled: false },
        steps: [
          {
            type: "conditional",
            name: "check",
            condition: "enabled",
            then: [{ type: "skill", name: "then-step", skill: "s1", prompt: "then" }],
            else: [{ type: "skill", name: "else-step", skill: "s2", prompt: "else" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.stepName).toBe("else-step");
    });

    it("executes nothing when condition is false and no else branch", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "cond-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: {},
        steps: [
          {
            type: "conditional",
            name: "check",
            condition: "nonExistent",
            then: [{ type: "skill", name: "then-step", skill: "s1", prompt: "then" }],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
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

  describe("nested control flow", () => {
    it("supports conditional inside for-each", async () => {
      const executor = createMockSkillExecutor();
      const engine = createFlowEngine({ skillExecutor: executor });

      const flow: FlowDefinition = {
        name: "nested-flow",
        defaultTool: "opencode",
        defaultModel: "test-model",
        variables: {
          items: ["important", "normal"],
          important: true,
          normal: false,
        },
        steps: [
          {
            type: "for-each",
            name: "process",
            items: "items",
            as: "item",
            steps: [
              {
                type: "conditional",
                name: "check-priority",
                condition: "item",
                then: [
                  {
                    type: "skill",
                    name: "process-item",
                    skill: "processor",
                    prompt: "Process {{item}}",
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = await engine.executeFlow({ flow });
      expect(result.success).toBe(true);
      // Both "important" and "normal" are truthy strings, so both should be processed
      expect(result.results).toHaveLength(2);
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
