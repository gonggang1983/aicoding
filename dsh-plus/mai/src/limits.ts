export const limits = Object.freeze({
  metadataBytes: 1024 * 1024,
  tasksPerRun: 20,
  defaultTimeoutSeconds: 120,
  minTimeoutSeconds: 1,
  maxTimeoutSeconds: 1800,
  outputBytes: 64 * 1024,
  gitPaths: 200,
  terminationConfirmationMs: 5000,
});
