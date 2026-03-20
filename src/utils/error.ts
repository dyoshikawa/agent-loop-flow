/**
 * Formats an unknown error into a human-readable string.
 */
export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error, null, 2);
};
