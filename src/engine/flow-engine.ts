import type {
  ConditionalStep,
  FlowDefinition,
  ForEachStep,
  SkillStep,
  Step,
  ToolType,
  WhileLoopStep,
} from "../flow/flow-schema.js";
import { formatError } from "../utils/error.js";
import { logger } from "../utils/logger.js";

/**
 * Result of executing a single skill step.
 */
export type SkillResult = {
  stepName: string;
  skill: string;
  output: string;
  success: boolean;
  error?: string;
};

/**
 * Result of executing a complete flow.
 */
export type FlowResult = {
  flowName: string;
  success: boolean;
  results: SkillResult[];
  variables: Record<string, unknown>;
  error?: string;
};

/**
 * Skill executor function signature.
 * Implementations should invoke the actual skill (e.g., via OpenCode SDK or Claude Agent SDK).
 */
export type SkillExecutor = (params: {
  skill: string;
  prompt: string;
  variables: Record<string, unknown>;
  config?: Record<string, unknown>;
  tool: ToolType;
  model: string;
}) => Promise<{ output: string; success: boolean }>;

/**
 * Condition evaluator function signature.
 * Evaluates a condition string against the current variables context.
 */
export type ConditionEvaluator = (params: {
  condition: string;
  variables: Record<string, unknown>;
  lastResult?: SkillResult;
}) => boolean;

/**
 * Default condition evaluator using simple expression matching.
 * Supports:
 * - Variable references: "variableName" checks truthiness of variables[variableName]
 * - Equality: "variable == value"
 * - Inequality: "variable != value"
 * - Last result checks: "lastResult.success", "lastResult.output contains X"
 */
export const defaultConditionEvaluator: ConditionEvaluator = ({
  condition,
  variables,
  lastResult,
}) => {
  const trimmed = condition.trim();

  // Check for "lastResult.success"
  if (trimmed === "lastResult.success") {
    return lastResult?.success ?? false;
  }

  // Check for "lastResult.output contains X"
  const containsMatch = /^lastResult\.output\s+contains\s+"(.+)"$/.exec(trimmed);
  if (containsMatch?.[1] !== undefined) {
    return lastResult?.output.includes(containsMatch[1]) ?? false;
  }

  // Check for equality: "variable == value"
  const eqMatch = /^(\w+)\s*==\s*"?(.+?)"?$/.exec(trimmed);
  if (eqMatch?.[1] !== undefined && eqMatch[2] !== undefined) {
    return String(variables[eqMatch[1]] ?? "") === eqMatch[2];
  }

  // Check for inequality: "variable != value"
  const neqMatch = /^(\w+)\s*!=\s*"?(.+?)"?$/.exec(trimmed);
  if (neqMatch?.[1] !== undefined && neqMatch[2] !== undefined) {
    return String(variables[neqMatch[1]] ?? "") !== neqMatch[2];
  }

  // Simple truthiness check on a variable
  return Boolean(variables[trimmed]);
};

/**
 * Default items resolver for for-each loops.
 * Resolves a variable name to an array of items.
 */
export const defaultItemsResolver = ({
  items,
  variables,
}: {
  items: string;
  variables: Record<string, unknown>;
}): unknown[] => {
  const value = variables[items];
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim());
  }
  return [];
};

const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Flow engine that executes flow definitions step by step.
 */
export const createFlowEngine = ({
  skillExecutor,
  conditionEvaluator = defaultConditionEvaluator,
  itemsResolver = defaultItemsResolver,
}: {
  skillExecutor: SkillExecutor;
  conditionEvaluator?: ConditionEvaluator;
  itemsResolver?: (params: { items: string; variables: Record<string, unknown> }) => unknown[];
}) => {
  const executeSkillStep = async ({
    step,
    variables,
    defaultTool,
    defaultModel,
  }: {
    step: SkillStep;
    variables: Record<string, unknown>;
    defaultTool: ToolType;
    defaultModel: string;
  }): Promise<SkillResult> => {
    const tool = step.tool ?? defaultTool;
    const model = step.model ?? defaultModel;
    logger.info(
      `Executing skill step: ${step.name} (skill: ${step.skill}, tool: ${tool}, model: ${model})`,
    );

    // Interpolate variables in the prompt
    const interpolatedPrompt = interpolateTemplate({ template: step.prompt, variables });

    try {
      const { output, success } = await skillExecutor({
        skill: step.skill,
        prompt: interpolatedPrompt,
        variables,
        config: step.config,
        tool,
        model,
      });

      const result: SkillResult = {
        stepName: step.name,
        skill: step.skill,
        output,
        success,
      };

      logger.info(`Step "${step.name}" completed: success=${String(success)}`);
      return result;
    } catch (error) {
      const errorMessage = formatError(error);
      logger.error(`Step "${step.name}" failed: ${errorMessage}`);
      return {
        stepName: step.name,
        skill: step.skill,
        output: "",
        success: false,
        error: errorMessage,
      };
    }
  };

  const executeConditionalStep = async ({
    step,
    variables,
    lastResult,
    defaultTool,
    defaultModel,
  }: {
    step: ConditionalStep;
    variables: Record<string, unknown>;
    lastResult?: SkillResult;
    defaultTool: ToolType;
    defaultModel: string;
  }): Promise<SkillResult[]> => {
    logger.info(`Evaluating condition: ${step.name} (${step.condition})`);

    const conditionResult = conditionEvaluator({
      condition: step.condition,
      variables,
      lastResult,
    });

    logger.info(`Condition "${step.condition}" evaluated to: ${String(conditionResult)}`);

    if (conditionResult) {
      return executeSteps({ steps: step.then, variables, lastResult, defaultTool, defaultModel });
    }

    if (step.else) {
      return executeSteps({ steps: step.else, variables, lastResult, defaultTool, defaultModel });
    }

    return [];
  };

  const executeWhileLoop = async ({
    step,
    variables,
    lastResult,
    defaultTool,
    defaultModel,
  }: {
    step: WhileLoopStep;
    variables: Record<string, unknown>;
    lastResult?: SkillResult;
    defaultTool: ToolType;
    defaultModel: string;
  }): Promise<SkillResult[]> => {
    const maxIterations = step.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const results: SkillResult[] = [];
    let iteration = 0;
    let currentLastResult = lastResult;

    logger.info(`Starting while-loop: ${step.name} (max: ${String(maxIterations)} iterations)`);

    while (iteration < maxIterations) {
      const shouldContinue = conditionEvaluator({
        condition: step.condition,
        variables,
        lastResult: currentLastResult,
      });

      if (!shouldContinue) {
        logger.info(
          `While-loop "${step.name}" condition false after ${String(iteration)} iterations`,
        );
        break;
      }

      logger.info(`While-loop "${step.name}" iteration ${String(iteration + 1)}`);
      const iterationResults = await executeSteps({
        steps: step.steps,
        variables,
        lastResult: currentLastResult,
        defaultTool,
        defaultModel,
      });
      results.push(...iterationResults);

      currentLastResult = iterationResults[iterationResults.length - 1] ?? currentLastResult;
      iteration++;
    }

    if (iteration >= maxIterations) {
      logger.warn(`While-loop "${step.name}" reached max iterations (${String(maxIterations)})`);
    }

    return results;
  };

  const executeForEach = async ({
    step,
    variables,
    lastResult,
    defaultTool,
    defaultModel,
  }: {
    step: ForEachStep;
    variables: Record<string, unknown>;
    lastResult?: SkillResult;
    defaultTool: ToolType;
    defaultModel: string;
  }): Promise<SkillResult[]> => {
    const items = itemsResolver({ items: step.items, variables });
    const results: SkillResult[] = [];
    let currentLastResult = lastResult;

    logger.info(`Starting for-each: ${step.name} (${String(items.length)} items)`);

    for (const [index, item] of items.entries()) {
      logger.info(`For-each "${step.name}" item ${String(index + 1)}/${String(items.length)}`);

      const iterationVariables = {
        ...variables,
        [step.as]: item,
        [`${step.as}_index`]: index,
      };

      const iterationResults = await executeSteps({
        steps: step.steps,
        variables: iterationVariables,
        lastResult: currentLastResult,
        defaultTool,
        defaultModel,
      });
      results.push(...iterationResults);

      currentLastResult = iterationResults[iterationResults.length - 1] ?? currentLastResult;
    }

    return results;
  };

  const executeSteps = async ({
    steps,
    variables,
    lastResult,
    defaultTool,
    defaultModel,
  }: {
    steps: Step[];
    variables: Record<string, unknown>;
    lastResult?: SkillResult;
    defaultTool: ToolType;
    defaultModel: string;
  }): Promise<SkillResult[]> => {
    const results: SkillResult[] = [];
    let currentLastResult = lastResult;

    for (const step of steps) {
      switch (step.type) {
        case "skill": {
          const result = await executeSkillStep({ step, variables, defaultTool, defaultModel });
          results.push(result);
          currentLastResult = result;
          break;
        }
        case "conditional": {
          const condResults = await executeConditionalStep({
            step,
            variables,
            lastResult: currentLastResult,
            defaultTool,
            defaultModel,
          });
          results.push(...condResults);
          if (condResults.length > 0) {
            currentLastResult = condResults[condResults.length - 1];
          }
          break;
        }
        case "while-loop": {
          const whileResults = await executeWhileLoop({
            step,
            variables,
            lastResult: currentLastResult,
            defaultTool,
            defaultModel,
          });
          results.push(...whileResults);
          if (whileResults.length > 0) {
            currentLastResult = whileResults[whileResults.length - 1];
          }
          break;
        }
        case "for-each": {
          const forEachResults = await executeForEach({
            step,
            variables,
            lastResult: currentLastResult,
            defaultTool,
            defaultModel,
          });
          results.push(...forEachResults);
          if (forEachResults.length > 0) {
            currentLastResult = forEachResults[forEachResults.length - 1];
          }
          break;
        }
      }
    }

    return results;
  };

  /**
   * Executes a complete flow definition.
   */
  const executeFlow = async ({
    flow,
    initialVariables = {},
  }: {
    flow: FlowDefinition;
    initialVariables?: Record<string, unknown>;
  }): Promise<FlowResult> => {
    const variables: Record<string, unknown> = {
      ...flow.variables,
      ...initialVariables,
    };

    logger.info(`Starting flow: ${flow.name}`);

    try {
      const results = await executeSteps({
        steps: flow.steps,
        variables,
        defaultTool: flow.defaultTool,
        defaultModel: flow.defaultModel,
      });
      const success = results.every((r) => r.success);

      logger.info(`Flow "${flow.name}" completed: success=${String(success)}`);

      return {
        flowName: flow.name,
        success,
        results,
        variables,
      };
    } catch (error) {
      const errorMessage = formatError(error);
      logger.error(`Flow "${flow.name}" failed: ${errorMessage}`);

      return {
        flowName: flow.name,
        success: false,
        results: [],
        variables,
        error: errorMessage,
      };
    }
  };

  return { executeFlow };
};

/**
 * Interpolates {{variable}} placeholders in a template string.
 */
export const interpolateTemplate = ({
  template,
  variables,
}: {
  template: string;
  variables: Record<string, unknown>;
}): string => {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return `{{${key}}}`;
    }
    return String(value);
  });
};
