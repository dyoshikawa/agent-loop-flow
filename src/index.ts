/**
 * Public API for agent-loop-flow.
 */

// Flow schema and types
export {
  FlowDefinitionSchema,
  StepSchema,
  PromptStepSchema,
  NextRuleSchema,
  NextSchema,
  ToolTypeSchema,
} from "./flow/flow-schema.js";
export type {
  FlowDefinition,
  Step,
  PromptStep,
  NextRule,
  Next,
  WhileLoopStep,
  ForEachStep,
  ToolType,
} from "./flow/flow-schema.js";

// Flow parser
export { parseFlowFile, parseFlowContent, resolveFlowPath } from "./flow/flow-parser.js";

// Flow engine
export {
  createFlowEngine,
  interpolateTemplate,
  defaultConditionEvaluator,
  defaultItemsResolver,
} from "./engine/flow-engine.js";
export type {
  PromptExecutor,
  PromptResult,
  FlowResult,
  ConditionEvaluator,
} from "./engine/flow-engine.js";
