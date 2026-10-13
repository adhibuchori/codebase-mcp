/** read_code: read a file, a line range, one symbol, or a file's outline. */
import { z } from 'zod';
import { defineTool } from '../registry/define-tool.ts';
import { renderRead } from './read-code.format.ts';
import { readCode } from './read-code.service.ts';

export const readCodeTool = defineTool({
  name: 'read_code',
  title: 'Read code',
  description:
    'Reads code by reference, with line numbers. "repo/path#Name" reads exactly one function or class (Class.method works too); "repo/path:120" reads the lines around line 120; "repo/path:120-180" reads a range; "repo/path" reads a small file whole, or shows the outline (every definition with its line range) of a large one so the next call can read just one part. Use mode "outline" to get the outline of any file. Example: {"ref": "orders/src/main/java/com/acme/OrderService.java#cancel"}.',
  input: {
    ref: z
      .string()
      .min(3)
      .describe('repo/path, repo/path:120, repo/path:120-180 or repo/path#Symbol'),
    mode: z
      .enum(['auto', 'content', 'outline'])
      .default('auto')
      .describe('auto (default), content (force the text) or outline.'),
    context: z
      .number()
      .int()
      .min(0)
      .max(100)
      .default(25)
      .describe('Lines shown on each side of a single-line reference (default 25).'),
  },
  run: async (args, context) => renderRead(await readCode(args, context), context.budget),
});
