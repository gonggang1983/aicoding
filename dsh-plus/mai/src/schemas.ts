import type { JsonSchemaNode, ObjectJsonSchema } from '@deepseek-ai/dsh-tools';
const string: JsonSchemaNode = { type: 'string' };
const boolean: JsonSchemaNode = { type: 'boolean' };
const number: JsonSchemaNode = { type: 'number' };
const integer: JsonSchemaNode = { type: 'integer' };
const nullable = (value: JsonSchemaNode): JsonSchemaNode => ({ oneOf: [value, { type: 'null' }] });
const array = (items: JsonSchemaNode): JsonSchemaNode => ({ type: 'array', items });
export const object = (properties: Record<string, JsonSchemaNode>, required = Object.keys(properties)): ObjectJsonSchema => ({ type: 'object', properties, required, additionalProperties: false });
export const gitSchema = object({ status: { type: 'string', enum: ['available', 'unavailable', 'incomplete'] },
  reason: string, capturedAt: string, paths: array(object({ path: string, originalPath: nullable(string), status: string })),
  totalCount: nullable(integer), omittedCount: nullable(integer) });
export const planSchema = object({ planId: string, digest: string, projectPath: string, expiresAt: string,
  nodeExecutable: string, npmCliPath: string, mode: string, risk: string,
  tasks: array(object({ id: string, name: string, script: string, args: array(string), argv: array(string), timeoutSeconds: integer, selected: boolean })) });
export const reportSchema = object({ reportVersion: { type: 'integer', const: 1 }, kind: { type: 'string', const: 'run' },
  runId: string, planId: string, projectPath: string, projectName: string, candidates: array(string), plan: planSchema,
  evidenceGaps: array(string), notices: array(string), startedAt: string, endedAt: string,
  overall: { type: 'string', enum: ['passed', 'failed', 'inconclusive'] }, approval: string, reason: string,
  tasks: array(object({ id: string, name: string, selected: boolean,
    status: { type: 'string', enum: ['passed', 'failed', 'not_run', 'unknown'] }, reason: string,
    startedAt: nullable(string), endedAt: nullable(string), durationMs: nullable(number), exitCode: nullable(integer),
    stdout: string, stderr: string, truncated: boolean, outputIncomplete: boolean, mode: string, enforcement: string })),
  git: gitSchema, gitBefore: gitSchema, environment: object({ node: string, npm: string, dsh: string }), disclaimer: string, privacyNotice: string });
export const previewInput = object({ projectPath: string, taskIds: array(string) }, ['taskIds']);
export const runInput = object({ plan: planSchema });
export const reportInput = object({ runId: string });
