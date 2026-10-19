/**
 * How a tool is declared and registered. Every tool is closed-world and read-only, except the opt-in
 * switch_branch, which says so in its annotations. Every answer is redacted and held under the
 * response budget, and every failure becomes an `isError` result the model can act on (a ToolError
 * keeps its message and hint; anything else stays generic and is logged).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { describeError, ToolError } from '../../core/errors/tool-error.ts';
import { estimateTokens, truncateText } from '../../core/output/budget.ts';
import { redactSecrets } from '../../core/security/redact.ts';
import type { Catalog } from '../../engine/catalog.ts';
import type { EngineDeps } from '../../engine/engine-deps.types.ts';

export interface ToolContext {
  readonly deps: EngineDeps;
  readonly catalog: Catalog;
  /** Character budget for one answer. */
  readonly budget: number;
}

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export interface ToolDef<Shape extends z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: Shape;
  /** Only for a tool that changes something (switch_branch); the default is read-only. */
  readonly annotations?: Partial<typeof ANNOTATIONS>;
  run(args: z.output<z.ZodObject<Shape>>, context: ToolContext): Promise<string>;
}

export type ToolRegistrar = (server: McpServer, context: ToolContext) => void;

type TextResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

/** Arguments arrive already validated by the SDK; parsing them again gives the tool its exact types. */
async function execute<Shape extends z.ZodRawShape>(
  def: ToolDef<Shape>,
  args: unknown,
  context: ToolContext,
): Promise<TextResult> {
  const started = context.deps.clock.now();
  try {
    const parsed = z.object(def.input).parse(args);
    const text = truncateText(redactSecrets(await def.run(parsed, context)), context.budget);
    context.deps.logger.info('tool', {
      tool: def.name,
      ms: context.deps.clock.now() - started,
      chars: text.length,
      tokens: estimateTokens(text),
    });
    return { content: [{ type: 'text', text }] };
  } catch (error) {
    if (!(error instanceof ToolError))
      context.deps.logger.error('tool failed', {
        tool: def.name,
        error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      });
    return { content: [{ type: 'text', text: `Error: ${describeError(error)}` }], isError: true };
  }
}

export function defineTool<Shape extends z.ZodRawShape>(def: ToolDef<Shape>): ToolRegistrar {
  /* Widened to the plain shape type so the SDK's callback type resolves; execute() restores the
     exact argument types by parsing. */
  const inputSchema: z.ZodRawShape = def.input;
  return (server, context) => {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema,
        annotations: { title: def.title, ...ANNOTATIONS, ...def.annotations },
      },
      (args: unknown) => execute(def, args, context),
    );
  };
}
