import { z } from "zod/mini";

/**
 * Schema for a skill step - invokes a single skill with a prompt.
 */
export const SkillStepSchema = z.object({
  type: z.literal("skill"),
  name: z.string().check(z.minLength(1)),
  skill: z.string().check(z.minLength(1)),
  prompt: z.string().check(z.minLength(1)),
  config: z.optional(z.record(z.string(), z.unknown())),
});
export type SkillStep = z.infer<typeof SkillStepSchema>;

/**
 * Manually defined Step type to avoid circular type inference issues with z.lazy().
 */
export type Step = SkillStep | ConditionalStep | WhileLoopStep | ForEachStep;

export type ConditionalStep = {
  type: "conditional";
  name: string;
  condition: string;
  then: Step[];
  else?: Step[] | undefined;
};

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
 * Schema for a conditional step - branches execution based on a condition.
 */
export const ConditionalStepSchema: z.core.$ZodType<ConditionalStep> = z.object({
  type: z.literal("conditional"),
  name: z.string().check(z.minLength(1)),
  condition: z.string().check(z.minLength(1)),
  // oxlint-disable-next-line unicorn/no-thenable -- "then" is a conditional branch name, not a Promise thenable
  then: z.array(z.lazy((): z.core.$ZodType<Step> => StepSchema)),
  else: z.optional(z.array(z.lazy((): z.core.$ZodType<Step> => StepSchema))),
});

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
  ConditionalStepSchema,
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
  variables: z.optional(z.record(z.string(), z.unknown())),
  steps: z.array(StepSchema).check(z.minLength(1)),
});
export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;
