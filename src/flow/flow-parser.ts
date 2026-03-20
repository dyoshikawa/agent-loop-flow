import { join } from "node:path";

import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";
import type { ParseError } from "jsonc-parser";

import { readFileContent } from "../utils/file.js";
import { FlowDefinitionSchema } from "./flow-schema.js";
import type { FlowDefinition } from "./flow-schema.js";

/**
 * Parses a JSONC flow definition file and validates it against the schema.
 */
export const parseFlowFile = async ({
  filePath,
}: {
  filePath: string;
}): Promise<FlowDefinition> => {
  const content = await readFileContent({ filePath });
  return parseFlowContent({ content, filePath });
};

/**
 * Parses JSONC content string and validates it against the flow schema.
 */
export const parseFlowContent = ({
  content,
  filePath = "<inline>",
}: {
  content: string;
  filePath?: string;
}): FlowDefinition => {
  const errors: ParseError[] = [];
  const parsed: unknown = parseJsonc(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => `  offset ${String(e.offset)}: ${printParseErrorCode(e.error)}`)
      .join("\n");
    throw new Error(`JSONC parse errors in ${filePath}:\n${errorMessages}`);
  }

  if (parsed === undefined || parsed === null) {
    throw new Error(`Empty or invalid JSONC content in ${filePath}`);
  }

  const result = FlowDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    const issueMessages = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Flow validation errors in ${filePath}:\n${issueMessages}`);
  }

  return result.data;
};

/**
 * Resolves a flow file path relative to a base directory.
 */
export const resolveFlowPath = ({
  baseDir = process.cwd(),
  relativePath,
}: {
  baseDir?: string;
  relativePath: string;
}): string => {
  return join(baseDir, relativePath);
};
