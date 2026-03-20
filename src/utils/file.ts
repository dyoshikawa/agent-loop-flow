import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Reads a file's content as a UTF-8 string.
 */
export const readFileContent = async ({ filePath }: { filePath: string }): Promise<string> => {
  return readFile(filePath, "utf-8");
};

/**
 * Ensures that a directory exists, creating it recursively if needed.
 */
export const ensureDir = async (dirPath: string): Promise<void> => {
  await mkdir(dirPath, { recursive: true });
};

/**
 * Removes a directory and all its contents.
 */
export const removeDir = async (dirPath: string): Promise<void> => {
  await rm(dirPath, { recursive: true, force: true });
};

/**
 * Returns the home directory. Throws in test environment to enforce explicit mocking.
 */
export const getHomeDirectory = (): string => {
  if (process.env["NODE_ENV"] === "test") {
    throw new Error(
      "getHomeDirectory() must be mocked in test environment. Use setupTestDirectory({ home: true }) instead.",
    );
  }
  return homedir();
};

/**
 * Resolves a file path relative to a base directory.
 */
export const resolveFilePath = ({
  baseDir,
  relativePath,
}: {
  baseDir: string;
  relativePath: string;
}): string => {
  return join(baseDir, relativePath);
};
