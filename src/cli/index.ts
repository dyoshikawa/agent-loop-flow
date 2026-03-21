#!/usr/bin/env node

import { spawn } from "node:child_process";
import { join } from "node:path";

import { Command } from "commander";

import { createFlowEngine } from "../engine/flow-engine.js";
import type { SkillExecutor } from "../engine/flow-engine.js";
import { parseFlowFile } from "../flow/flow-parser.js";
import { formatError } from "../utils/error.js";
import { logger } from "../utils/logger.js";

/**
 * Spawns a CLI command as a child process and returns the output.
 */
const spawnCliProcess = ({
  command,
  args,
  cwd,
}: {
  command: string;
  args: string[];
  cwd: string;
}): Promise<{ output: string; success: boolean }> => {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn(command, args, {
      cwd,
      stdio: ["inherit", "pipe", "pipe"],
    });

    child.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("error", (error: Error) => {
      logger.error(`Failed to spawn ${command}: ${error.message}`);
      resolve({
        output: stderr || error.message,
        success: false,
      });
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({
          output: stdout,
          success: true,
        });
      } else {
        resolve({
          output: stderr || stdout,
          success: false,
        });
      }
    });
  });
};

/**
 * Skill executor that uses OpenCode CLI to run skills.
 * Spawns `opencode run "<prompt>"` as a child process.
 */
const createOpenCodeSkillExecutor = (options: { cwd?: string } = {}): SkillExecutor => {
  return async ({ skill, prompt, variables, model }) => {
    logger.info(`[Skill: ${skill}] Running via OpenCode CLI...`);

    // Interpolate variables into prompt
    let interpolatedPrompt = prompt;
    for (const [key, value] of Object.entries(variables)) {
      interpolatedPrompt = interpolatedPrompt.replaceAll(`{{${key}}}`, String(value));
    }

    // Add skill context to prompt
    const fullPrompt = `[Skill: ${skill}]\n\n${interpolatedPrompt}`;

    const args = ["run", fullPrompt];
    if (model) {
      args.unshift("--model", model);
    }

    return spawnCliProcess({
      command: "opencode",
      args,
      cwd: options.cwd || process.cwd(),
    });
  };
};

/**
 * Skill executor that uses Claude Agent CLI (claude) to run skills.
 * Spawns `claude --print "<prompt>"` as a child process.
 */
const createClaudeAgentSkillExecutor = (options: { cwd?: string } = {}): SkillExecutor => {
  return async ({ skill, prompt, variables, model }) => {
    logger.info(`[Skill: ${skill}] Running via Claude Agent CLI...`);

    // Interpolate variables into prompt
    let interpolatedPrompt = prompt;
    for (const [key, value] of Object.entries(variables)) {
      interpolatedPrompt = interpolatedPrompt.replaceAll(`{{${key}}}`, String(value));
    }

    // Add skill context to prompt
    const fullPrompt = `[Skill: ${skill}]\n\n${interpolatedPrompt}`;

    const args = ["--print", fullPrompt];
    if (model) {
      args.unshift("--model", model);
    }

    return spawnCliProcess({
      command: "claude",
      args,
      cwd: options.cwd || process.cwd(),
    });
  };
};

/**
 * Skill executor that routes to the appropriate tool executor based on the tool parameter.
 */
const createRoutingSkillExecutor = (options: { cwd?: string } = {}): SkillExecutor => {
  const openCodeExecutor = createOpenCodeSkillExecutor(options);
  const claudeAgentExecutor = createClaudeAgentSkillExecutor(options);

  return async (params) => {
    switch (params.tool) {
      case "opencode":
        return openCodeExecutor(params);
      case "claude-agent":
        return claudeAgentExecutor(params);
    }
  };
};

const createProgram = (): Command => {
  const program = new Command();

  program
    .name("agent-loop-flow")
    .description(
      "AI coding agent utility CLI - orchestrate prompt flows with transitions and loops",
    )
    .version("0.1.0");

  program
    .command("run")
    .description("Run a flow definition file")
    .argument("<file>", "Path to the flow definition file (.jsonc)")
    .option("-v, --var <vars...>", "Set variables (key=value)")
    .option("--dry-run", "Parse and validate the flow without executing", false)
    .action(
      async (
        file: string,
        options: {
          var?: string[];
          dryRun?: boolean;
        },
      ) => {
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

          const executor = createRoutingSkillExecutor();
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
      },
    );

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
