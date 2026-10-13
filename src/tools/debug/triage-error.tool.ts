/** triage_error: paste a stack trace, log line, error message or URL; get the code behind it. */
import { z } from 'zod';
import { defineTool } from '../registry/define-tool.ts';
import { groupField, reposField } from '../registry/shared-input.ts';
import { renderTriage } from './debug.format.ts';
import { triage } from './triage.service.ts';

export const triageErrorTool = defineTool({
  name: 'triage_error',
  title: 'Triage error',
  description:
    'The debugging entry point. Paste what you have — a stack trace (Java/Kotlin, Go, Python, Node/TypeScript, .NET, PHP, Ruby), a log line or error message (timestamps, ids and numbers are ignored), or a URL/route — and get the code behind it: each application frame resolved to repo/path:line with surrounding lines and the enclosing function, the statement that writes the message, or the handler of the route. Example: {"text": "java.lang.IllegalStateException: Order already cancelled\\n\\tat com.acme.orders.OrderService.cancel(OrderService.java:42)"}.',
  input: {
    text: z
      .string()
      .min(3)
      .max(20_000)
      .describe('The stack trace, log line, error message or URL, as pasted.'),
    kind: z
      .enum(['auto', 'stacktrace', 'log', 'url'])
      .default('auto')
      .describe('What the text is; auto-detected by default.'),
    repos: reposField,
    group: groupField,
  },
  run: async (args, context) => renderTriage(await triage(args, context), context.budget),
});
