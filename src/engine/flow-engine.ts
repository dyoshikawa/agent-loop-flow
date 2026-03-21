import type {
  FlowDefinition,
  ForEachStep,
  Next,
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
 * Resolves the `next` field of a skill step to determine the target step name.
 * Returns `undefined` when normal fall-through should occur.
 */
const resolveNext = ({
  next,
  conditionEvaluator,
  variables,
  lastResult,
}: {
  next: Next | undefined;
  conditionEvaluator: ConditionEvaluator;
  variables: Record<string, unknown>;
  lastResult?: SkillResult;
}): string | undefined => {
  if (next === undefined) {
    return undefined;
  }

  // Bare string: unconditional jump
  if (typeof next === "string") {
    return next;
  }

  // Array of rules: evaluate conditions in order
  for (const rule of next) {
    if (rule.condition === undefined) {
      // Default (else) rule -- no condition means always match
      return rule.step;
    }
    const matched = conditionEvaluator({ condition: rule.condition, variables, lastResult });
    if (matched) {
      return rule.step;
    }
  }

  // No rule matched -- fall through
  return undefined;
};

/**
 * Flow engine that executes flow definitions step by step.
 * Steps are a flat list with optional `next` rules controlling transitions.
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
    lastResult,
    defaultTool,
    defaultModel,
  }: {
    step: SkillStep;
    variables: Record<string, unknown>;
    lastResult?: SkillResult;
    defaultTool: ToolType;
    defaultModel: string;
  }): Promise<SkillResult> => {
    const tool = step.tool ?? defaultTool;
    const model = step.model ?? defaultModel;
    logger.info(
      `Executing skill step: ${step.name} (skill: ${step.skill}, tool: ${tool}, model: ${model})`,
    );

    // Inject previousResult into variables for prompt template interpolation.
    // Flat camelCase variables for simple access:
    //   {{previousResultOutput}}, {{previousResultSuccess}}, etc.
    // Structured object for dot-path access:
    //   {{previousResult.output}}, {{previousResult.success}}, etc.
    const templateVariables: Record<string, unknown> = { ...variables };
    if (lastResult) {
      templateVariables["previousResultOutput"] = lastResult.output;
      templateVariables["previousResultSuccess"] = lastResult.success;
      templateVariables["previousResultStepName"] = lastResult.stepName;
      templateVariables["previousResultSkill"] = lastResult.skill;
      if (lastResult.error !== undefined) {
        templateVariables["previousResultError"] = lastResult.error;
      }

      // Structured object for dot-path access (e.g. {{previousResult.output}})
      templateVariables["previousResult"] = {
        output: lastResult.output,
        success: lastResult.success,
        stepName: lastResult.stepName,
        skill: lastResult.skill,
        error: lastResult.error,
      };
    }

    // Interpolate variables in the prompt
    const interpolatedPrompt = interpolateTemplate({
      template: step.prompt,
      variables: templateVariables,
    });

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

  /**
   * Executes a list of steps using the flat transition model.
   *
   * Steps are indexed by position. After each skill step the engine checks
   * the `next` field:
   * - If `next` resolves to a step name, the engine jumps to that step.
   * - If `next` is undefined / no rule matches, the engine falls through to the
   *   next step in array order.
   *
   * Loop steps (while-loop, for-each) do NOT support `next` rules -- they
   * always fall through when done.
   */
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

    // Build name -> index map for jump resolution
    const nameToIndex = new Map<string, number>();
    for (const [i, step] of steps.entries()) {
      nameToIndex.set(step.name, i);
    }

    let cursor = 0;
    while (cursor < steps.length) {
      const step = steps[cursor];
      if (step === undefined) break;

      switch (step.type) {
        case "skill": {
          const result = await executeSkillStep({
            step,
            variables,
            lastResult: currentLastResult,
            defaultTool,
            defaultModel,
          });
          results.push(result);
          currentLastResult = result;

          // Resolve next transition
          const target = resolveNext({
            next: step.next,
            conditionEvaluator,
            variables,
            lastResult: currentLastResult,
          });

          if (target !== undefined) {
            const targetIndex = nameToIndex.get(target);
            if (targetIndex !== undefined) {
              cursor = targetIndex;
              continue;
            }
            logger.warn(`Next target "${target}" not found in step list, falling through`);
          }

          cursor++;
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
          cursor++;
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
          cursor++;
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
 * Resolves a dot-path (e.g. "previousResult.output") against a variables record.
 * Returns `undefined` if any segment along the path is missing.
 */
const resolveVariablePath = (path: string, variables: Record<string, unknown>): unknown => {
  const segments = path.split(".");
  let current: unknown = variables;
  for (const segment of segments) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    // Safe index access into a plain object
    const obj: Record<string, unknown> = Object.fromEntries(Object.entries(current));
    current = obj[segment];
  }
  return current;
};

/**
 * Interpolates {{variable}} placeholders in a template string.
 * Supports both simple variables (e.g. {{name}}) and dot-path access
 * (e.g. {{previousResult.output}}).
 *
 * Object values are not stringified -- the placeholder is kept intact so that
 * only scalar (string / number / boolean) values are substituted.
 */
export const interpolateTemplate = ({
  template,
  variables,
}: {
  template: string;
  variables: Record<string, unknown>;
}): string => {
  return template.replace(/\{\{([\w.]+)\}\}/g, (_match, key: string) => {
    const value = resolveVariablePath(key, variables);
    if (value === undefined || value === null) {
      return `{{${key}}}`;
    }
    // Keep placeholder for object/array values -- only interpolate scalars
    if (typeof value === "object") {
      return `{{${key}}}`;
    }
    return String(value);
  });
};
