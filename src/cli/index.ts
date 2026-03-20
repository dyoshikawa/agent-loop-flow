#!/usr/bin/env node

import { join } from "node:path";

import { Command } from "commander";

import { createFlowEngine } from "../engine/flow-engine.js";
import type { SkillExecutor } from "../engine/flow-engine.js";
import { parseFlowFile } from "../flow/flow-parser.js";
import { formatError } from "../utils/error.js";
import { logger } from "../utils/logger.js";

/**
 * Default skill executor that logs the skill invocation.
 * In a real implementation, this would integrate with OpenCode SDK or Claude Agent SDK.
 */
const createDefaultSkillExecutor = (): SkillExecutor => {
  return async ({ skill, prompt, variables }) => {
    logger.info(`[Skill: ${skill}] Prompt: ${prompt}`);
    logger.info(`[Skill: ${skill}] Variables: ${JSON.stringify(variables)}`);

    return {
      output: `Executed skill "${skill}" with prompt: ${prompt}`,
      success: true,
    };
  };
};

const createProgram = (): Command => {
  const program = new Command();

  program
    .name("agent-loop-flow")
    .description(
      "AI coding agent utility CLI - orchestrate skill flows with conditionals and loops",
    )
    .version("0.1.0");

  program
    .command("run")
    .description("Run a flow definition file")
    .argument("<file>", "Path to the flow definition file (.jsonc)")
    .option("-v, --var <vars...>", "Set variables (key=value)")
    .option("--dry-run", "Parse and validate the flow without executing", false)
    .action(async (file: string, options: { var?: string[]; dryRun?: boolean }) => {
      try {
        const filePath = join(process.cwd(), file);
        logger.info(`Loading flow file: ${filePath}`);

        const flow = await parseFlowFile({ filePath });
        logger.info(`Flow loaded: ${flow.name}`);

        if (options.dryRun) {
          logger.info("Dry run mode - flow validated successfully");
          logger.info(`Flow: ${flow.name}`);
          logger.info(`Steps: ${String(flow.steps.length)}`);
          if (flow.description) {
            logger.info(`Description: ${flow.description}`);
          }
          return;
        }

        // Parse variables from CLI args
        const initialVariables: Record<string, unknown> = {};
        if (options.var) {
          for (const v of options.var) {
            const eqIndex = v.indexOf("=");
            if (eqIndex > 0) {
              const key = v.substring(0, eqIndex);
              const value = v.substring(eqIndex + 1);
              initialVariables[key] = value;
            }
          }
        }

        const executor = createDefaultSkillExecutor();
        const engine = createFlowEngine({ skillExecutor: executor });
        const result = await engine.executeFlow({ flow, initialVariables });

        if (result.success) {
          logger.info(`Flow "${result.flowName}" completed successfully`);
          logger.info(`Total steps executed: ${String(result.results.length)}`);
        } else {
          logger.error(`Flow "${result.flowName}" failed`);
          if (result.error) {
            logger.error(result.error);
          }
          process.exitCode = 1;
        }
      } catch (error) {
        logger.error(`Failed to run flow: ${formatError(error)}`);
        process.exitCode = 1;
      }
    });

  program
    .command("validate")
    .description("Validate a flow definition file without executing it")
    .argument("<file>", "Path to the flow definition file (.jsonc)")
    .action(async (file: string) => {
      try {
        const filePath = join(process.cwd(), file);
        const flow = await parseFlowFile({ filePath });
        logger.info(`Valid flow: ${flow.name}`);
        logger.info(`Steps: ${String(flow.steps.length)}`);
        if (flow.description) {
          logger.info(`Description: ${flow.description}`);
        }
      } catch (error) {
        logger.error(`Invalid flow: ${formatError(error)}`);
        process.exitCode = 1;
      }
    });

  return program;
};

const main = async (): Promise<void> => {
  const program = createProgram();
  await program.parseAsync(process.argv);
};

await main();
