import { writeFileSync } from "node:fs";
import { join } from "node:path";

import * as z from "zod";

// Import schema directly from source - zod and zod/mini schemas are compatible in Zod v4
import { FlowDefinitionSchema } from "../src/flow/flow-schema.js";

// Generate JSON Schema from the source schema
// Note: zod/mini schemas work with zod's toJSONSchema in Zod v4
const generatedSchema = z.toJSONSchema(FlowDefinitionSchema, {
  reused: "ref",
});

// Add JSON Schema meta properties (override Zod's default $schema with draft-07 for broader compatibility)
const jsonSchema = {
  ...generatedSchema,
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://raw.githubusercontent.com/dyoshikawa-claw/agent-loop-flow/refs/heads/main/flow-schema.json",
  title: "Agent Loop Flow Definition",
  description: "Schema for defining AI agent skill flows with transitions and loops",
};

// Output to project root
const outputPath = join(process.cwd(), "flow-schema.json");

// Write schema file
writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2) + "\n");

// oxlint-disable-next-line no-console
console.log(`JSON Schema generated: ${outputPath}`);
