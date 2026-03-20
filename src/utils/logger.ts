// oxlint-disable-next-line import/no-named-as-default -- consola uses default export pattern
import consola from "consola";

const isTest = process.env["NODE_ENV"] === "test";

/**
 * Logger instance that suppresses output during tests.
 */
export const logger = consola.create({
  level: isTest ? -1 : 3,
});
