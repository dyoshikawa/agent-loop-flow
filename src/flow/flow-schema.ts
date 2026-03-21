import { z } from "zod/mini";

/**
 * Schema for the tool type - which CLI tool to use for prompt execution.
 */
export const ToolTypeSchema = z.union([z.literal("opencode"), z.literal("claude-agent")]);
export type ToolType = z.infer<typeof ToolTypeSchema>;

/**
 * Schema for a next-rule entry.
 * Each rule has a condition expression and a target step id.
 * A rule without a condition acts as the default (else) branch.
 */
export const NextRuleSchema = z.object({
  condition: z.optional(z.string().check(z.minLength(1))),
  step: z.string().check(z.minLength(1)),
});
export type NextRule = z.infer<typeof NextRuleSchema>;

/**
 * Schema for the "next" field on a prompt step.
 * - A bare string means "always go to this step id".
 * - An array of NextRule objects provides conditional branching.
 */
export const NextSchema = z.union([z.string().check(z.minLength(1)), z.array(NextRuleSchema)]);
export type Next = z.infer<typeof NextSchema>;

/**
 * Schema for a prompt step - invokes a named prompt with a body.
 * `id` is the step identifier used as a jump target in `next` rules.
 * `name` is the invocation name (what was previously called `skill`).
 * `prompt` is the prompt body text (supports `{{var}}` interpolation).
 * The optional `next` field controls which step executes after this one.
 */
export const PromptStepSchema = z.object({
  type: z.literal("prompt"),
  id: z.string().check(z.minLength(1)),
  name: z.string().check(z.minLength(1)),
  prompt: z.string().check(z.minLength(1)),
  config: z.optional(z.record(z.string(), z.unknown())),
  tool: z.optional(ToolTypeSchema),
  model: z.optional(z.string().check(z.minLength(1))),
  next: z.optional(NextSchema),
});
export type PromptStep = z.infer<typeof PromptStepSchema>;

/**
 * Manually defined Step type to avoid circular type inference issues with z.lazy().
 */
export type Step = PromptStep | WhileLoopStep | ForEachStep;

export type WhileLoopStep = {
  type: "while-loop";
  id: string;
  condition: string;
  maxIterations?: number | undefined;
  steps: Step[];
};

export type ForEachStep = {
  type: "for-each";
  id: string;
  items: string;
  as: string;
  steps: Step[];
};

/**
 * Schema for a while-loop step - repeats steps while a condition is true.
 */
export const WhileLoopStepSchema: z.core.$ZodType<WhileLoopStep> = z.object({
  type: z.literal("while-loop"),
  id: z.string().check(z.minLength(1)),
  condition: z.string().check(z.minLength(1)),
  maxIterations: z.optional(z.number().check(z.minimum(1))),
  steps: z.array(z.lazy((): z.core.$ZodType<Step> => StepSchema)),
});

/**
 * Schema for a for-each step - iterates over a list of items.
 */
export const ForEachStepSchema: z.core.$ZodType<ForEachStep> = z.object({
  type: z.literal("for-each"),
  id: z.string().check(z.minLength(1)),
  items: z.string().check(z.minLength(1)),
  as: z.string().check(z.minLength(1)),
  steps: z.array(z.lazy((): z.core.$ZodType<Step> => StepSchema)),
});

/**
 * Union schema for all step types.
 */
export const StepSchema: z.core.$ZodType<Step> = z.union([
  PromptStepSchema,
  WhileLoopStepSchema,
  ForEachStepSchema,
]);

/**
 * Schema for a complete flow definition.
 */
export const FlowDefinitionSchema = z.object({
  $schema: z.optional(z.string()),
  name: z.string().check(z.minLength(1)),
  description: z.optional(z.string()),
  version: z.optional(z.string()),
  defaultTool: ToolTypeSchema,
  defaultModel: z.string().check(z.minLength(1)),
  variables: z.optional(z.record(z.string(), z.unknown())),
  steps: z.array(StepSchema).check(z.minLength(1)),
});
export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;
