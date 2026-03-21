import { z } from "zod/mini";

/**
 * Schema for the tool type - which CLI tool to use for skill execution.
 */
export const ToolTypeSchema = z.union([z.literal("opencode"), z.literal("claude-agent")]);
export type ToolType = z.infer<typeof ToolTypeSchema>;

/**
 * Schema for a next-rule entry.
 * Each rule has a condition expression and a target step name.
 * A rule without a condition acts as the default (else) branch.
 */
export const NextRuleSchema = z.object({
  condition: z.optional(z.string().check(z.minLength(1))),
  step: z.string().check(z.minLength(1)),
});
export type NextRule = z.infer<typeof NextRuleSchema>;

/**
 * Schema for the "next" field on a skill step.
 * - A bare string means "always go to this step".
 * - An array of NextRule objects provides conditional branching.
 */
export const NextSchema = z.union([z.string().check(z.minLength(1)), z.array(NextRuleSchema)]);
export type Next = z.infer<typeof NextSchema>;

/**
 * Schema for a skill step - invokes a single skill with a prompt.
 * The optional `next` field controls which step executes after this one.
 */
export const SkillStepSchema = z.object({
  type: z.literal("skill"),
  name: z.string().check(z.minLength(1)),
  skill: z.string().check(z.minLength(1)),
  prompt: z.string().check(z.minLength(1)),
  config: z.optional(z.record(z.string(), z.unknown())),
  tool: z.optional(ToolTypeSchema),
  model: z.optional(z.string().check(z.minLength(1))),
  next: z.optional(NextSchema),
});
export type SkillStep = z.infer<typeof SkillStepSchema>;

/**
 * Manually defined Step type to avoid circular type inference issues with z.lazy().
 */
export type Step = SkillStep | WhileLoopStep | ForEachStep;

export type WhileLoopStep = {
  type: "while-loop";
  name: string;
  condition: string;
  maxIterations?: number | undefined;
  steps: Step[];
};

export type ForEachStep = {
  type: "for-each";
  name: string;
  items: string;
  as: string;
  steps: Step[];
};

/**
 * Schema for a while-loop step - repeats steps while a condition is true.
 */
export const WhileLoopStepSchema: z.core.$ZodType<WhileLoopStep> = z.object({
  type: z.literal("while-loop"),
  name: z.string().check(z.minLength(1)),
  condition: z.string().check(z.minLength(1)),
  maxIterations: z.optional(z.number().check(z.minimum(1))),
  steps: z.array(z.lazy((): z.core.$ZodType<Step> => StepSchema)),
});

/**
 * Schema for a for-each step - iterates over a list of items.
 */
export const ForEachStepSchema: z.core.$ZodType<ForEachStep> = z.object({
  type: z.literal("for-each"),
  name: z.string().check(z.minLength(1)),
  items: z.string().check(z.minLength(1)),
  as: z.string().check(z.minLength(1)),
  steps: z.array(z.lazy((): z.core.$ZodType<Step> => StepSchema)),
});

/**
 * Union schema for all step types.
 */
export const StepSchema: z.core.$ZodType<Step> = z.union([
  SkillStepSchema,
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
