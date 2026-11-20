import type { Context } from '@deepseek-ai/cordis';
import { ToolArgsError, ToolContextUnavailableError, validateJsonSchemaValue, type ToolDefinition, type ToolRunContext, type ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
import { isAbsolute } from 'node:path';
import { Coordinator } from './coordinator.js';
import { CheckError } from './plan.js';
import { ConfigError } from './config.js';
import { MetadataError } from './host.js';
import type { PublicPlan, RunReport } from './types.js';
import { planMarkdown, reportMarkdown, recoveryAdvice } from './report.js';
import { planSchema, reportSchema, previewInput, runInput, reportInput } from './schemas.js';

/** Native ToolDefinition is used to share exact input/output schemas without casts in execution logic. */
export function registerRuntimeTools(ctx: Context, coordinator: Coordinator): void {
  const validate = (schema: ObjectJsonSchema, input: unknown): Record<string, unknown> => {
    if (validateJsonSchemaValue(schema, input).length) throw new ToolArgsError(['INVALID_PROJECT_CHECK_ARGUMENTS']);
    return input as Record<string, unknown>;
  };
  const protect = async <T>(exec: ToolRunContext, work: () => Promise<T>): Promise<T> => {
    exec.signal.throwIfAborted();
    try { return await work(); }
    catch (error) {
      exec.signal.throwIfAborted();
      if (error instanceof ToolArgsError || error instanceof ToolContextUnavailableError) throw error;
      const code = error instanceof CheckError || error instanceof MetadataError || error instanceof ConfigError ? error.code : 'PROJECT_CHECK_UNAVAILABLE';
      // Stable code and fixed advice only, no provider error/cause/path or raw values.
      throw new ToolContextUnavailableError(`${code}: ${recoveryAdvice(code)}`);
    }
  };
  const tools: ToolDefinition[] = [
    {
      name: 'project_check_preview', description: 'Freeze configured tasks without executing scripts. Requires a session and trusted deployed npm CLI. Inspect the complete plan; its planId is also the future runId for cancellation evidence retrieval.',
      parameters: { ...previewInput },
      output: { schema: planSchema, render: (_args, value) => [{ type: 'text', text: planMarkdown(value as unknown as PublicPlan) }] },
      async execute(input, exec) {
        return protect(exec, async () => {
          const args = validate(previewInput, input);
          const path = args.projectPath as string | undefined ?? exec.agent?.session.header.cwd;
          if (!path || !isAbsolute(path)) throw new ToolArgsError(['ABSOLUTE_PROJECT_PATH_REQUIRED']);
          return coordinator.preview(path, args.taskIds as string[], exec);
        });
      },
    },
    {
      name: 'project_check_run', description: 'Run an unchanged frozen plan only after real one-time host approval. Never accepts approved, command, environment or output-path flags. npm lifecycle scripts may change files or use the network within the host policy.',
      parameters: { ...runInput },
      output: { schema: reportSchema, render: (_args, value) => [{ type: 'text', text: reportMarkdown(value as unknown as RunReport) }] },
      async execute(input, exec) {
        return protect(exec, async () => {
          const args = validate(runInput, input);
          return coordinator.run(args.plan as PublicPlan, exec);
        });
      },
    },
    {
      name: 'project_check_report', description: 'Get the same-session safe in-memory run report. Use preview planId as runId after cancellation. Reports expire after 10 minutes; only the most recent five are retained. Does not execute or write files.',
      parameters: { ...reportInput },
      output: { schema: reportSchema, render: (_args, value) => [{ type: 'text', text: reportMarkdown(value as unknown as RunReport) }] },
      async execute(input, exec) {
        return protect(exec, async () => {
          const args = validate(reportInput, input);
          const result = coordinator.report(args.runId as string, exec);
          if (!result) throw new CheckError('REPORT_UNAVAILABLE');
          return result;
        });
      },
    },
  ];
  for (const tool of tools) ctx.tools.register(tool);
}
