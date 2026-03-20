import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const generateRandomString = (): string => {
  return Math.random().toString(36).substring(2, 10);
};

/**
 * Sets up a temporary test directory with automatic cleanup.
 * Use for project directories by default, or pass `{ home: true }` for pseudo-home directories.
 */
export const setupTestDirectory = async (
  options: { home?: boolean } = {},
): Promise<{ testDir: string; cleanup: () => Promise<void> }> => {
  const base = options.home ? "./tmp/tests/home" : "./tmp/tests/projects";
  const testDir = join(base, generateRandomString());
  await mkdir(testDir, { recursive: true });

  const cleanup = async (): Promise<void> => {
    await rm(testDir, { recursive: true, force: true });
  };

  return { testDir, cleanup };
};
